-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY
-- Captured from Snowflake GET_DDL on 2026-06-08. Source of truth.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE PROCEDURE "SP_REFRESH_FIXED_COST_REPORTED_DAILY"("LINE_ITEM_ID_FILTER" VARCHAR DEFAULT null, "BACKFILL_MODE" BOOLEAN DEFAULT FALSE)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
EXECUTE AS OWNER
AS '

const CAP_LOW = 0.5;
const CAP_HIGH = 1.3;
const ROLLING_WINDOW_DAYS = 3;
const DAILY_FACT_BATCH_SIZE = 500;

const lineItemIdFilter = LINE_ITEM_ID_FILTER;
const backfillMode = BACKFILL_MODE;

// =====================================================
// HELPERS
// =====================================================

function safeDiv(num, den) {
    if (!den || den === 0) return 0;
    const r = num / den;
    return Number.isFinite(r) ? r : 0;
}

function isFixedCostBuyType(buyType) {
    return (buyType || '''').toLowerCase() === ''fixed_cost'';
}

function metricColumnForBuyType(buyType) {
    const bt = (buyType || '''').toLowerCase();
    if (bt === ''cpm'') return ''IMPRESSIONS'';
    if (bt === ''cpc'') return ''CLICKS'';
    if (bt === ''cpv'') return ''VIDEO_3S_VIEWS'';
    if (bt === ''cpa'') return ''RESULTS'';
    if (bt === ''fixed_cost'') return null;  // no platform-side deliverable metric
    return ''IMPRESSIONS'';
}

function factTableForSource(sourceTable) {
    if (sourceTable === ''media_plan_search'') return ''ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT'';
    if (sourceTable === ''media_plan_social'') return ''ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT'';
    if (sourceTable === ''media_plan_prog_display'' ||
        sourceTable === ''media_plan_prog_video'' ||
        sourceTable === ''media_plan_prog_bvod'' ||
        sourceTable === ''media_plan_prog_audio'' ||
        sourceTable === ''media_plan_prog_ooh'') return ''ASSEMBLEDVIEW.MART.PACING_FACT'';
    return null;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function parseMoney(s) {
    if (s == null) return 0;
    if (typeof s === ''number'') return s;
    return parseFloat(String(s).replace(/[$,]/g, '''')) || 0;
}

function toDateString(d) {
    if (typeof d === ''string'') return d.slice(0, 10);
    return new Date(d).toISOString().slice(0, 10);
}

function dateRange(startStr, endStr) {
    const dates = [];
    const cur = new Date(startStr + ''T00:00:00Z'');
    const end = new Date(endStr + ''T00:00:00Z'');
    while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return dates;
}

function daysBetween(startStr, endStr) {
    const s = new Date(startStr + ''T00:00:00Z'');
    const e = new Date(endStr + ''T00:00:00Z'');
    return Math.round((e - s) / 86400000) + 1;
}

function fetchLineItems() {
    let sql = `
        SELECT 
            LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
            BUY_TYPE, FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE
        FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
        WHERE FIXED_COST_MEDIA = TRUE
    `;
    if (lineItemIdFilter) sql += ` AND LINE_ITEM_ID = ?`;
    sql += ` ORDER BY LINE_ITEM_ID`;

    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: lineItemIdFilter ? [lineItemIdFilter] : []
    });
    const rs = stmt.execute();
    const items = [];
    while (rs.next()) {
        items.push({
            lineItemId: rs.getColumnValue(1),
            mbaNumber: rs.getColumnValue(2),
            lineItemName: rs.getColumnValue(3),
            buyType: rs.getColumnValue(4),
            fixedCostMedia: rs.getColumnValue(5),
            burstsJson: rs.getColumnValue(6),
            sourceTable: rs.getColumnValue(7)
        });
    }
    return items;
}

function parseBursts(burstsJson) {
    let bursts = burstsJson;
    if (typeof burstsJson === ''string'') {
        bursts = JSON.parse(burstsJson);
    }
    if (!Array.isArray(bursts)) return [];

    return bursts.map((b, idx) => {
        const budget = parseMoney(b.budget);
        const buyAmount = parseMoney(b.buyAmount);
        const calculatedValue = parseFloat(b.calculatedValue) || 0;
        return {
            index: idx,
            startDate: toDateString(b.startDate),
            endDate: toDateString(b.endDate),
            budget: budget,
            buyAmount: buyAmount,
            calculatedValue: calculatedValue,
            durationDays: daysBetween(toDateString(b.startDate), toDateString(b.endDate))
        };
    });
}

function fetchDeliveryForBurst(lineItemId, sourceTable, buyType, burstStart, burstEnd) {
    const factTable = factTableForSource(sourceTable);
    if (!factTable) return {};

    const metricCol = metricColumnForBuyType(buyType);
    let sql;

    if (metricCol === null) {
        // fixed_cost — fetch only platform spend; deliverables are not meaningful
        sql = `
            SELECT 
                DATE_DAY,
                SUM(AMOUNT_SPENT) AS ACTUAL_SPEND,
                0 AS ACTUAL_DELIVERABLES
            FROM ${factTable}
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
            AND DATE_DAY BETWEEN ? AND ?
            GROUP BY DATE_DAY
            ORDER BY DATE_DAY
        `;
    } else {
        sql = `
            SELECT 
                DATE_DAY,
                SUM(AMOUNT_SPENT) AS ACTUAL_SPEND,
                SUM(${metricCol}) AS ACTUAL_DELIVERABLES
            FROM ${factTable}
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
            AND DATE_DAY BETWEEN ? AND ?
            GROUP BY DATE_DAY
            ORDER BY DATE_DAY
        `;
    }

    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: [lineItemId, burstStart, burstEnd]
    });
    const rs = stmt.execute();
    const byDate = {};
    while (rs.next()) {
        const d = rs.getColumnValue(1);
        const dateStr = (d instanceof Date)
            ? d.toISOString().slice(0, 10)
            : String(d).slice(0, 10);
        byDate[dateStr] = {
            actualSpend: parseFloat(rs.getColumnValue(2) || 0),
            actualDeliverables: parseFloat(rs.getColumnValue(3) || 0)
        };
    }
    return byDate;
}

function computeBurstReportedSpends(burst, deliveryByDate, buyType) {
    const fixedCost = isFixedCostBuyType(buyType);
    const evenDailyRate = safeDiv(burst.budget, burst.durationDays);

    // ---------- fixed_cost branch: date-based linear smoothing ----------
if (fixedCost) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const burstComplete = todayStr > burst.endDate;
    const dates = dateRange(burst.startDate, burst.endDate);
    const reported = {};
    for (let i = 0; i < dates.length; i++) {
        const day = dates[i];
        const delivery = deliveryByDate[day] || { actualSpend: 0, actualDeliverables: 0 };
        const daysCompleted = i + 1;
        // Only accrue reported spend for days that have passed (day <= today)
        const dayHasPassed = day <= todayStr;
        const reportedSpend = dayHasPassed ? evenDailyRate : 0;
        reported[day] = {
            reportedSpend: reportedSpend,
            actualSpend: delivery.actualSpend,
            actualDeliverables: 0,
            shareToday: dayHasPassed ? safeDiv(daysCompleted, burst.durationDays) : 0,
            capApplied: ''fixed_cost'',
            isSquareup: false
        };
    }
    // Final-day rounding squareup ONLY when burst is fully complete
    if (burstComplete && dates.length > 0) {
        const totalReported = Object.values(reported)
            .reduce(function(s, r) { return s + r.reportedSpend; }, 0);
        const drift = burst.budget - totalReported;
        if (Math.abs(drift) > 0.0001) {
            reported[dates[dates.length - 1]].reportedSpend += drift;
            reported[dates[dates.length - 1]].isSquareup = true;
            reported[dates[dates.length - 1]].capApplied = ''fixed_cost_rounding'';
        }
    }
    return reported;
}

    // ---------- delivery-shaped logic for cpm/cpc/cpv/cpa ----------
    const expectedDaily = safeDiv(burst.calculatedValue, burst.durationDays);
    const capLowAmount = CAP_LOW * evenDailyRate;
    const capHighAmount = CAP_HIGH * evenDailyRate;

    const dates = dateRange(burst.startDate, burst.endDate);
    const reported = {};
    let runningReported = 0;

    for (let i = 0; i < dates.length; i++) {
        const day = dates[i];
        const daysCompleted = i + 1;
        const delivery = deliveryByDate[day] || { actualSpend: 0, actualDeliverables: 0 };

        if (delivery.actualDeliverables === 0) {
            reported[day] = {
                reportedSpend: 0,
                actualSpend: delivery.actualSpend,
                actualDeliverables: 0,
                shareToday: 0,
                capApplied: ''none'',
                isSquareup: false
            };
            continue;
        }

        // safeDiv guards against expectedDaily=0 (calculatedValue=0 data-entry case)
        const shareTodayRaw = safeDiv(delivery.actualDeliverables, expectedDaily);
        // Bound stored shareToday to fit NUMBER(8,4) regardless of plan-shape edge cases
        const shareToday = Math.min(shareTodayRaw, 9999.9999);
        const shareCapped = clamp(shareToday, CAP_LOW, CAP_HIGH);
        const initialReported = evenDailyRate * shareCapped;

        let adjustedReported;
        let capApplied = ''none'';

        if (shareToday < 1.0) {
            adjustedReported = initialReported;
            if (shareToday < CAP_LOW) capApplied = ''low'';
        } else {
            const paceTarget = burst.budget * (daysCompleted / burst.durationDays);
            const idealToday = paceTarget - runningReported;
            adjustedReported = clamp(idealToday, capLowAmount, capHighAmount);
            adjustedReported = Math.min(adjustedReported, initialReported);
            if (shareToday > CAP_HIGH) capApplied = ''high'';
        }

        adjustedReported = clamp(adjustedReported, capLowAmount, capHighAmount);

        reported[day] = {
            reportedSpend: adjustedReported,
            actualSpend: delivery.actualSpend,
            actualDeliverables: delivery.actualDeliverables,
            shareToday: shareToday,
            capApplied: capApplied,
            isSquareup: false
        };
        runningReported += adjustedReported;
    }

    let lastDeliveryDay = null;
    for (let i = dates.length - 1; i >= 0; i--) {
        if (reported[dates[i]].actualDeliverables > 0) {
            lastDeliveryDay = dates[i];
            break;
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    const burstHasCompleted = today > burst.endDate;

    if (burstHasCompleted && lastDeliveryDay) {
        const totalActualDeliverables = Object.values(reported)
            .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);
        const deliveryRatio = safeDiv(totalActualDeliverables, burst.calculatedValue);

        if (deliveryRatio >= 1.0) {
            const runningWithoutLast = runningReported - reported[lastDeliveryDay].reportedSpend;
            const squareupAmount = burst.budget - runningWithoutLast;
            reported[lastDeliveryDay].reportedSpend = squareupAmount;
            reported[lastDeliveryDay].isSquareup = true;
            reported[lastDeliveryDay].capApplied = ''squareup'';
        }
    }

    return reported;
}

function isLockedDay(dayStr, today, isBackfill) {
    if (isBackfill) return true;
    const dayDate = new Date(dayStr + ''T00:00:00Z'');
    const todayDate = new Date(today + ''T00:00:00Z'');
    const diffDays = Math.round((todayDate - dayDate) / 86400000);
    return diffDays >= ROLLING_WINDOW_DAYS;
}

// =====================================================
// BATCH MERGE FOR DAILY FACT
// =====================================================

function buildDailyFactBatchMergeSql(rowCount) {
    const placeholders = Array(rowCount)
        .fill(''(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'')
        .join('',\\n        '');

    return `
        MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT t
        USING (
          SELECT
            column1::VARCHAR AS LINE_ITEM_ID,
            column2::NUMBER AS BURST_INDEX,
            column3::DATE AS DATE_DAY,
            column4::DECIMAL(18,4) AS REPORTED_SPEND,
            column5::DECIMAL(18,4) AS ACTUAL_PLATFORM_SPEND,
            column6::DECIMAL(18,4) AS ACTUAL_DELIVERABLES,
            column7::DECIMAL(18,4) AS EXPECTED_DAILY_DELIVERABLES,
            column8::DECIMAL(18,4) AS BURST_BUDGET,
            column9::DATE AS BURST_START_DATE,
            column10::DATE AS BURST_END_DATE,
            column11::VARCHAR AS BUY_TYPE,
            column12::DECIMAL(18,4) AS BUY_AMOUNT,
            column13::DECIMAL(8,4) AS SHARE_TODAY,
            column14::VARCHAR AS CAP_APPLIED,
            column15::NUMBER::BOOLEAN AS IS_SQUAREUP_DAY,
            column16::NUMBER::BOOLEAN AS IS_LOCKED
          FROM VALUES
            ${placeholders}
        ) s
        ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
           AND t.BURST_INDEX = s.BURST_INDEX
           AND t.DATE_DAY = s.DATE_DAY
        WHEN MATCHED THEN UPDATE SET
            REPORTED_SPEND = s.REPORTED_SPEND,
            ACTUAL_PLATFORM_SPEND = s.ACTUAL_PLATFORM_SPEND,
            ACTUAL_DELIVERABLES = s.ACTUAL_DELIVERABLES,
            EXPECTED_DAILY_DELIVERABLES = s.EXPECTED_DAILY_DELIVERABLES,
            BURST_BUDGET = s.BURST_BUDGET,
            BURST_START_DATE = s.BURST_START_DATE,
            BURST_END_DATE = s.BURST_END_DATE,
            BUY_TYPE = s.BUY_TYPE,
            BUY_AMOUNT = s.BUY_AMOUNT,
            SHARE_TODAY = s.SHARE_TODAY,
            CAP_APPLIED = s.CAP_APPLIED,
            IS_SQUAREUP_DAY = s.IS_SQUAREUP_DAY,
            IS_LOCKED = s.IS_LOCKED,
            CALCULATED_AT = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
            LINE_ITEM_ID, BURST_INDEX, DATE_DAY,
            REPORTED_SPEND, ACTUAL_PLATFORM_SPEND, ACTUAL_DELIVERABLES, EXPECTED_DAILY_DELIVERABLES,
            BURST_BUDGET, BURST_START_DATE, BURST_END_DATE,
            BUY_TYPE, BUY_AMOUNT, SHARE_TODAY, CAP_APPLIED,
            IS_SQUAREUP_DAY, IS_LOCKED, CALCULATED_AT
        ) VALUES (
            s.LINE_ITEM_ID, s.BURST_INDEX, s.DATE_DAY,
            s.REPORTED_SPEND, s.ACTUAL_PLATFORM_SPEND, s.ACTUAL_DELIVERABLES, s.EXPECTED_DAILY_DELIVERABLES,
            s.BURST_BUDGET, s.BURST_START_DATE, s.BURST_END_DATE,
            s.BUY_TYPE, s.BUY_AMOUNT, s.SHARE_TODAY, s.CAP_APPLIED,
            s.IS_SQUAREUP_DAY, s.IS_LOCKED, CURRENT_TIMESTAMP()
        )
    `;
}

function batchUpsertDailyFacts(allDailyRows) {
    let upserted = 0;
    for (let i = 0; i < allDailyRows.length; i += DAILY_FACT_BATCH_SIZE) {
        const batch = allDailyRows.slice(i, i + DAILY_FACT_BATCH_SIZE);
        const sql = buildDailyFactBatchMergeSql(batch.length);
        const binds = [];
        for (const row of batch) {
            binds.push(
                row.lineItemId,
                row.burstIndex,
                row.dateDay,
                row.reportedSpend,
                row.actualPlatformSpend,
                row.actualDeliverables,
                row.expectedDailyDeliverables,
                row.burstBudget,
                row.burstStartDate,
                row.burstEndDate,
                row.buyType,
                row.buyAmount,
                row.shareToday,
                row.capApplied,
                row.isSquareup ? 1 : 0,
                row.isLocked ? 1 : 0
            );
        }
        const stmt = snowflake.createStatement({ sqlText: sql, binds: binds });
        stmt.execute();
        upserted += batch.length;
    }
    return upserted;
}

// =====================================================
// PER-ROW MERGE FOR BURST FACT
// =====================================================

const BURST_FACT_MERGE_SQL = `
    MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT t
    USING (
      SELECT
        ?::VARCHAR AS LINE_ITEM_ID,
        ?::NUMBER AS BURST_INDEX,
        ?::DATE AS BURST_START_DATE,
        ?::DATE AS BURST_END_DATE,
        ?::DECIMAL(18,4) AS BURST_BUDGET,
        ?::DECIMAL(18,4) AS BURST_EXPECTED_DELIVERABLES,
        ?::DECIMAL(18,4) AS BURST_ACTUAL_DELIVERABLES,
        ?::DECIMAL(8,4) AS BURST_DELIVERY_RATIO,
        ?::DECIMAL(18,4) AS BURST_REPORTED_SPEND,
        ?::DECIMAL(18,4) AS BURST_ACTUAL_PLATFORM_SPEND,
        ?::DECIMAL(18,4) AS BURST_VARIANCE,
        ?::VARCHAR AS BURST_STATUS
    ) s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
       AND t.BURST_INDEX = s.BURST_INDEX
    WHEN MATCHED THEN UPDATE SET
        BURST_START_DATE = s.BURST_START_DATE,
        BURST_END_DATE = s.BURST_END_DATE,
        BURST_BUDGET = s.BURST_BUDGET,
        BURST_EXPECTED_DELIVERABLES = s.BURST_EXPECTED_DELIVERABLES,
        BURST_ACTUAL_DELIVERABLES = s.BURST_ACTUAL_DELIVERABLES,
        BURST_DELIVERY_RATIO = s.BURST_DELIVERY_RATIO,
        BURST_REPORTED_SPEND = s.BURST_REPORTED_SPEND,
        BURST_ACTUAL_PLATFORM_SPEND = s.BURST_ACTUAL_PLATFORM_SPEND,
        BURST_VARIANCE = s.BURST_VARIANCE,
        BURST_STATUS = s.BURST_STATUS,
        LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        LINE_ITEM_ID, BURST_INDEX, BURST_START_DATE, BURST_END_DATE,
        BURST_BUDGET, BURST_EXPECTED_DELIVERABLES, BURST_ACTUAL_DELIVERABLES, BURST_DELIVERY_RATIO,
        BURST_REPORTED_SPEND, BURST_ACTUAL_PLATFORM_SPEND, BURST_VARIANCE, BURST_STATUS,
        LAST_CALCULATED_AT
    ) VALUES (
        s.LINE_ITEM_ID, s.BURST_INDEX, s.BURST_START_DATE, s.BURST_END_DATE,
        s.BURST_BUDGET, s.BURST_EXPECTED_DELIVERABLES, s.BURST_ACTUAL_DELIVERABLES, s.BURST_DELIVERY_RATIO,
        s.BURST_REPORTED_SPEND, s.BURST_ACTUAL_PLATFORM_SPEND, s.BURST_VARIANCE, s.BURST_STATUS,
        CURRENT_TIMESTAMP()
    )
`;

function upsertBurstFact(lineItemId, burst, dailyData, today, buyType) {
    const fixedCost = isFixedCostBuyType(buyType);

    const burstReported = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.reportedSpend; }, 0);
    const burstActual = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.actualSpend; }, 0);
    const burstActualDeliverables = Object.values(dailyData)
        .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);

    // For fixed_cost: deliverables and ratio are not meaningful
    const burstExpectedDeliverables = fixedCost ? 0 : burst.calculatedValue;
    const burstActualDeliverablesForBind = fixedCost ? 0 : burstActualDeliverables;
    const deliveryRatioRaw = fixedCost ? 0 : safeDiv(burstActualDeliverables, burst.calculatedValue);
    const deliveryRatio = Math.min(deliveryRatioRaw, 9999.9999);  // bound to NUMBER(8,4)

    let burstStatus;
    if (today < burst.startDate) burstStatus = ''pending'';
    else if (today <= burst.endDate) burstStatus = ''in_progress'';
    else if (fixedCost) burstStatus = ''completed'';  // no over/under for fixed_cost
    else if (deliveryRatioRaw >= 1.0) burstStatus = ''completed_over'';
    else burstStatus = ''completed_under'';

    const stmt = snowflake.createStatement({
        sqlText: BURST_FACT_MERGE_SQL,
        binds: [
            lineItemId, burst.index,
            burst.startDate, burst.endDate,
            burst.budget,
            burstExpectedDeliverables,
            burstActualDeliverablesForBind,
            deliveryRatio,
            burstReported,
            burstActual,
            burstReported - burstActual,
            burstStatus
        ]
    });
    stmt.execute();
}

// =====================================================
// PER-ROW MERGE FOR LINE ITEM FACT
// =====================================================

const LINE_ITEM_FACT_MERGE_SQL = `
    MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT t
    USING (
      SELECT
        ?::VARCHAR AS LINE_ITEM_ID,
        ?::VARCHAR AS MBA_NUMBER,
        ?::VARCHAR AS LINE_ITEM_NAME,
        ?::NUMBER::BOOLEAN AS IS_CURRENTLY_FIXED_COST,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_BUDGET,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_REPORTED,
        ?::DECIMAL(18,4) AS LINE_ITEM_TOTAL_ACTUAL,
        ?::DECIMAL(18,4) AS LINE_ITEM_VARIANCE,
        ?::NUMBER AS BURST_COUNT,
        ?::NUMBER AS BURSTS_DELIVERED_OVER,
        ?::NUMBER AS BURSTS_DELIVERED_UNDER
    ) s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
    WHEN MATCHED THEN UPDATE SET
        MBA_NUMBER = s.MBA_NUMBER,
        LINE_ITEM_NAME = s.LINE_ITEM_NAME,
        IS_CURRENTLY_FIXED_COST = s.IS_CURRENTLY_FIXED_COST,
        WAS_EVER_FIXED_COST = COALESCE(t.WAS_EVER_FIXED_COST, FALSE) OR s.IS_CURRENTLY_FIXED_COST,
        LINE_ITEM_TOTAL_BUDGET = s.LINE_ITEM_TOTAL_BUDGET,
        LINE_ITEM_TOTAL_REPORTED = s.LINE_ITEM_TOTAL_REPORTED,
        LINE_ITEM_TOTAL_ACTUAL = s.LINE_ITEM_TOTAL_ACTUAL,
        LINE_ITEM_VARIANCE = s.LINE_ITEM_VARIANCE,
        BURST_COUNT = s.BURST_COUNT,
        BURSTS_DELIVERED_OVER = s.BURSTS_DELIVERED_OVER,
        BURSTS_DELIVERED_UNDER = s.BURSTS_DELIVERED_UNDER,
        LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
        IS_CURRENTLY_FIXED_COST, WAS_EVER_FIXED_COST,
        LINE_ITEM_TOTAL_BUDGET, LINE_ITEM_TOTAL_REPORTED, LINE_ITEM_TOTAL_ACTUAL, LINE_ITEM_VARIANCE,
        BURST_COUNT, BURSTS_DELIVERED_OVER, BURSTS_DELIVERED_UNDER,
        LAST_CALCULATED_AT
    ) VALUES (
        s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME,
        s.IS_CURRENTLY_FIXED_COST, s.IS_CURRENTLY_FIXED_COST,
        s.LINE_ITEM_TOTAL_BUDGET, s.LINE_ITEM_TOTAL_REPORTED, s.LINE_ITEM_TOTAL_ACTUAL, s.LINE_ITEM_VARIANCE,
        s.BURST_COUNT, s.BURSTS_DELIVERED_OVER, s.BURSTS_DELIVERED_UNDER,
        CURRENT_TIMESTAMP()
    )
`;

function upsertLineItemFact(lineItem, allBurstData, today) {
    const fixedCost = isFixedCostBuyType(lineItem.buyType);

    let totalBudget = 0;
    let totalReported = 0;
    let totalActual = 0;
    let burstsOver = 0;
    let burstsUnder = 0;
    const burstIndices = Object.keys(allBurstData);

    for (const idx of burstIndices) {
        const { burst, dailyData } = allBurstData[idx];
        totalBudget += burst.budget;
        totalReported += Object.values(dailyData).reduce(function(s, r) { return s + r.reportedSpend; }, 0);
        totalActual += Object.values(dailyData).reduce(function(s, r) { return s + r.actualSpend; }, 0);

        // Skip over/under counting for fixed_cost (no delivery concept)
        if (!fixedCost && today > burst.endDate) {
            const burstActualDeliverables = Object.values(dailyData)
                .reduce(function(s, r) { return s + r.actualDeliverables; }, 0);
            const ratio = safeDiv(burstActualDeliverables, burst.calculatedValue);
            if (ratio >= 1.0) burstsOver++;
            else burstsUnder++;
        }
    }

    const stmt = snowflake.createStatement({
        sqlText: LINE_ITEM_FACT_MERGE_SQL,
        binds: [
            lineItem.lineItemId, lineItem.mbaNumber, lineItem.lineItemName,
            lineItem.fixedCostMedia ? 1 : 0,
            totalBudget, totalReported, totalActual, totalReported - totalActual,
            burstIndices.length, burstsOver, burstsUnder
        ]
    });
    stmt.execute();
}

// =====================================================
// MAIN
// =====================================================

const today = new Date().toISOString().slice(0, 10);
const lineItems = fetchLineItems();
const result = {
    line_items_processed: 0,
    line_items_errored: 0,
    daily_rows_upserted: 0,
    burst_rows_upserted: 0,
    daily_batches: 0,
    errors: [],
    backfill_mode: backfillMode,
    line_item_filter: lineItemIdFilter,
    today: today
};

for (const li of lineItems) {
    try {
        const fixedCost = isFixedCostBuyType(li.buyType);
        const bursts = parseBursts(li.burstsJson);
        const allBurstData = {};
        const dailyRowsForLineItem = [];

        for (const burst of bursts) {
            const delivery = fetchDeliveryForBurst(
                li.lineItemId, li.sourceTable, li.buyType,
                burst.startDate, burst.endDate
            );
            const dailyData = computeBurstReportedSpends(burst, delivery, li.buyType);
            allBurstData[burst.index] = { burst: burst, dailyData: dailyData };

            // For fixed_cost, expectedDailyDeliverables is meaningless → 0
            const expectedDaily = fixedCost ? 0 : safeDiv(burst.calculatedValue, burst.durationDays);

            for (const [day, data] of Object.entries(dailyData)) {
                const locked = isLockedDay(day, today, backfillMode);
                if (!backfillMode && locked) continue;

                dailyRowsForLineItem.push({
                    lineItemId: li.lineItemId,
                    burstIndex: burst.index,
                    dateDay: day,
                    reportedSpend: data.reportedSpend,
                    actualPlatformSpend: data.actualSpend,
                    actualDeliverables: data.actualDeliverables,
                    expectedDailyDeliverables: expectedDaily,
                    burstBudget: burst.budget,
                    burstStartDate: burst.startDate,
                    burstEndDate: burst.endDate,
                    buyType: li.buyType,
                    buyAmount: burst.buyAmount,
                    shareToday: data.shareToday,
                    capApplied: data.capApplied,
                    isSquareup: data.isSquareup,
                    isLocked: locked
                });
            }
        }

        if (dailyRowsForLineItem.length > 0) {
            const upserted = batchUpsertDailyFacts(dailyRowsForLineItem);
            result.daily_rows_upserted += upserted;
            result.daily_batches += Math.ceil(dailyRowsForLineItem.length / DAILY_FACT_BATCH_SIZE);
        }

        for (const idx of Object.keys(allBurstData)) {
            const { burst, dailyData } = allBurstData[idx];
            upsertBurstFact(li.lineItemId, burst, dailyData, today, li.buyType);
            result.burst_rows_upserted += 1;
        }

        upsertLineItemFact(li, allBurstData, today);
        result.line_items_processed += 1;
    } catch (err) {
        result.line_items_errored += 1;
        result.errors.push(li.lineItemId + '': '' + (err.message || err));
        if (result.errors.length >= 10) {
            break;
        }
    }
}

return JSON.stringify(result);

';
