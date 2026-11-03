-- ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY
-- Rev 2026-11-03 (B23). Signature unchanged (VARCHAR DEFAULT NULL, BOOLEAN DEFAULT FALSE).
-- B23 adds, per line, only when the snapshot carries FIXED_COST_BURSTS_JSON
-- (the fixed_cost_report_net switch; null = the 2026-09-16 behaviour exactly):
--   * net media per burst (FC4) and Melbourne burst days, both from the app;
--   * FIXED_COST_FROM (FC2): reported rows only from that day. A burst cut by
--     the date reports its net media minus the actual spend before the date,
--     floored at 0 (FC6), over the days from the date. Expected deliverables
--     for the cut part are the plan minus those delivered before the date;
--   * package is time based, like fixed_cost (P14);
--   * in backfill mode, deletes this line's non-assumed rows outside the days
--     it reports (before the date, or outside a burst) and burst facts for
--     bursts it no longer reports; burst and line facts sum the reported days;
--   * the line fact records the basis and date it was last backfilled with
--     (REPORT_BASIS_APPLIED, FIXED_COST_FROM_APPLIED) so the nightly wrapper
--     backfills a line once when either changes.
-- B23fix: a backfill of a line back on the gross basis (the switch turned off)
-- whose line fact still says net_melbourne also deletes its non-assumed rows
-- outside the gross UTC burst days, so no Melbourne last-day row stays.
-- B23 also, for every line (not switch gated): a line whose latest snapshot is
-- no longer fixed cost media (and not assumed spend) gets
-- IS_CURRENTLY_FIXED_COST = FALSE on its line fact.
-- Needs the B23 ALTERs on XANO_LINE_ITEMS_SNAPSHOT and FIXED_COST_LINE_ITEM_FACT.
-- Reads MART.XANO_LINE_ITEMS_SNAPSHOT (frozen name). prog_* and digi_* route to PACING_FACT; cpv reads VIDEO_3S_VIEWS.
-- ASSUME_SPEND lines are written by SP_REFRESH_ASSUMED_SPEND_DAILY (cents / 100, CAP_APPLIED assumed_spend).
-- A filtered CALL delegates that one line. The unfiltered window skips them.
-- A line that is no longer ASSUME_SPEND, or that has a pacing fact row, loses its assumed_spend daily rows.
-- Safety (author only; Luke applies in Snowsight): LOWER filter on LINE_ITEM_ID; QUALIFY latest SYNCED_AT per id.
-- Do not CALL with a null id and BACKFILL_MODE true.
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
        sourceTable === ''media_plan_prog_ooh'' ||
        sourceTable === ''media_plan_digi_bvod'' ||
        sourceTable === ''media_plan_digi_video'' ||
        sourceTable === ''media_plan_digi_display'' ||
        sourceTable === ''media_plan_digi_audio'') return ''ASSEMBLEDVIEW.MART.PACING_FACT'';
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

// ---------- B23 helpers (used only when FIXED_COST_BURSTS_JSON is present) ----------

const NET_BASIS = ''net_melbourne'';
const ESTIMATE_SOURCE_TABLES = [
    ''media_plan_digi_display'', ''media_plan_digi_video'',
    ''media_plan_digi_audio'', ''media_plan_digi_bvod''
];

function isPackageBuyType(buyType) {
    return (buyType || '''').trim().toLowerCase() === ''package'';
}

function isIsoDay(s) {
    return typeof s === ''string'' && /^\\d{4}-\\d{2}-\\d{2}$/.test(s);
}

// Half up, away from zero, at cents (lib/money toCents).
function toCents(dollars) {
    if (!Number.isFinite(dollars)) return 0;
    const sign = dollars < 0 ? -1 : 1;
    const scaled = Math.abs(dollars) * 100;
    const cents = Math.round(scaled + Math.max(scaled, 1) * Number.EPSILON);
    const out = sign * cents;
    return out === 0 ? 0 : out;
}

function round2(dollars) {
    return toCents(dollars) / 100;
}

function parseNetBursts(raw) {
    let value = raw;
    if (value == null) return null;
    if (typeof value === ''string'') {
        try { value = JSON.parse(value); } catch (e) { return null; }
    }
    if (!Array.isArray(value)) return null;
    return value.map(function(b, idx) {
        const row = (b && typeof b === ''object'') ? b : {};
        const cents = Number(row.netMediaCents);
        return {
            index: Number.isFinite(Number(row.index)) ? Number(row.index) : idx,
            startDay: isIsoDay(row.startDay) ? row.startDay : null,
            endDay: isIsoDay(row.endDay) ? row.endDay : null,
            netMediaCents: Number.isFinite(cents) ? Math.round(cents) : 0
        };
    });
}

// Net media and Melbourne days from the app (FC4). Burst order is the stored order.
function applyNetBasis(bursts, netBursts) {
    const byIndex = {};
    for (const nb of netBursts) byIndex[nb.index] = nb;
    return bursts.map(function(b) {
        const nb = byIndex[b.index];
        if (!nb) return b;
        const startDate = nb.startDay || b.startDate;
        const endDate = nb.endDay || b.endDate;
        return Object.assign({}, b, {
            startDate: startDate,
            endDate: endDate,
            budget: nb.netMediaCents / 100,
            netMediaCents: nb.netMediaCents,
            durationDays: daysBetween(startDate, endDate)
        });
    });
}

// CM360 estimate units, as estimateDirectDigitalSpend reads them.
function estimateUnitColumn(buyType) {
    const bt = (buyType || '''').trim().toLowerCase();
    if (bt === ''cpc'' || bt === ''cpa'' || bt === ''cpl'') return ''CLICKS'';
    if (bt === ''cpv'') return ''VIDEO_3S_VIEWS'';
    return ''IMPRESSIONS'';
}

// The CM360 direct digital estimate before the date, by day, as the
// dashboard shows it when the line is not fixed cost
// (estimateDirectDigitalSpend, deriveSpendFromPlanRate): rate = planned net
// media / planned deliverables over the whole line, each day rounded to
// cents and capped cumulatively at the planned media. fixed_cost and
// package lines are not estimated (0).
function cm360EstimateBeforeDay(lineItemId, buyType, bursts, beforeDay) {
    const bt = (buyType || '''').trim().toLowerCase();
    if (bt === ''fixed_cost'' || bt === ''package'') return {};
    let plannedTotal = 0;
    let plannedDeliverables = 0;
    for (const b of bursts) {
        plannedTotal += b.budget;
        plannedDeliverables += b.calculatedValue;
    }
    const rate = plannedDeliverables > 0 ? plannedTotal / plannedDeliverables : 0;
    let remaining = round2(plannedTotal);
    if (!(rate > 0) || !(remaining > 0)) return {};
    const unitCol = estimateUnitColumn(buyType);
    const rs = snowflake.createStatement({
        sqlText: `
            SELECT DATE_DAY, SUM(${unitCol}) AS UNITS
            FROM ASSEMBLEDVIEW.MART.PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
            AND DATE_DAY < ?
            GROUP BY DATE_DAY
            ORDER BY DATE_DAY
        `,
        binds: [lineItemId, beforeDay]
    }).execute();
    const out = {};
    while (rs.next()) {
        const d = rs.getColumnValue(1);
        const day = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
        const units = parseFloat(rs.getColumnValue(2) || 0) || 0;
        if (remaining <= 0) { out[day] = 0; continue; }
        const derived = round2(Math.min(units * rate, remaining));
        remaining = round2(remaining - derived);
        out[day] = derived;
    }
    return out;
}

function sumDaysBefore(byDate, fromDay, startDay, field) {
    let sum = 0;
    for (const day of Object.keys(byDate)) {
        if (day < startDay || day >= fromDay) continue;
        const v = (field == null) ? byDate[day] : byDate[day][field];
        sum += Number(v) || 0;
    }
    return sum;
}

// The part of a burst that reports fixed cost from FIXED_COST_FROM.
//   null   the burst ends before the date: nothing reported.
//   whole  the burst starts on or after the date: the full burst, as before.
//   cut    the date falls inside: from the date, the net media minus the
//          actual spend before it, floored at 0 (FC6), and the plan
//          deliverables minus those delivered before it.
function fixedCostPortion(burst, fromDay, deliveryByDate, preEstimateByDate) {
    if (!fromDay || fromDay <= burst.startDate) return { kind: ''whole'', burst: burst, preActual: 0 };
    if (fromDay > burst.endDate) return null;
    const preActual = preEstimateByDate
        ? sumDaysBefore(preEstimateByDate, fromDay, burst.startDate, null)
        : sumDaysBefore(deliveryByDate, fromDay, burst.startDate, ''actualSpend'');
    const preDelivered = sumDaysBefore(deliveryByDate, fromDay, burst.startDate, ''actualDeliverables'');
    const netCents = Number.isFinite(burst.netMediaCents) ? burst.netMediaCents : toCents(burst.budget);
    const remainderCents = Math.max(0, netCents - toCents(preActual));
    return {
        kind: ''cut'',
        preActual: preActual,
        remainderCents: remainderCents,
        burst: Object.assign({}, burst, {
            startDate: fromDay,
            budget: remainderCents / 100,
            netMediaCents: remainderCents,
            durationDays: daysBetween(fromDay, burst.endDate),
            calculatedValue: Math.max(0, burst.calculatedValue - preDelivered)
        })
    };
}

function deliveryFromDay(deliveryByDate, fromDay) {
    const out = {};
    for (const day of Object.keys(deliveryByDate)) {
        if (day >= fromDay) out[day] = deliveryByDate[day];
    }
    return out;
}

// Backfill only: rows and burst facts outside what this line now reports.
function deleteRowsOutsideReported(lineItemId, keptWindows) {
    let sql = `
        DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT
        WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
          AND COALESCE(CAP_APPLIED, '''') <> ''assumed_spend''
    `;
    const binds = [lineItemId];
    if (keptWindows.length > 0) {
        const parts = keptWindows.map(function() { return ''(BURST_INDEX = ? AND DATE_DAY BETWEEN ? AND ?)''; });
        sql += '' AND NOT ('' + parts.join('' OR '') + '')'';
        for (const w of keptWindows) binds.push(w.index, w.startDate, w.endDate);
    }
    snowflake.createStatement({ sqlText: sql, binds: binds }).execute();

    let burstSql = `
        DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT
        WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
    `;
    const burstBinds = [lineItemId];
    if (keptWindows.length > 0) {
        burstSql += '' AND BURST_INDEX NOT IN ('' + keptWindows.map(function() { return ''?''; }).join('', '') + '')'';
        for (const w of keptWindows) burstBinds.push(w.index);
    }
    snowflake.createStatement({ sqlText: burstSql, binds: burstBinds }).execute();
}

// B23fix: true when the line was last backfilled on the net basis. Backfill
// only, so a gross line going back from net loses its Melbourne-only rows.
function lastBackfillWasNet(lineItemId) {
    const rs = snowflake.createStatement({
        sqlText: `
            SELECT 1
            FROM ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
              AND REPORT_BASIS_APPLIED = ?
            LIMIT 1
        `,
        binds: [lineItemId, NET_BASIS]
    }).execute();
    return rs.next();
}

// A line switched off fixed cost no longer lists as current (discovery 3.7).
function clearStaleCurrentlyFixedCost() {
    let sql = `
        UPDATE ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT f
        SET IS_CURRENTLY_FIXED_COST = FALSE,
            LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
        WHERE COALESCE(f.IS_CURRENTLY_FIXED_COST, FALSE) = TRUE
          AND EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
            WHERE LOWER(s.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
              AND COALESCE(s.FIXED_COST_MEDIA, FALSE) = FALSE
              AND COALESCE(s.ASSUME_SPEND, FALSE) = FALSE
              AND s.SYNCED_AT = (
                SELECT MAX(s2.SYNCED_AT)
                FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s2
                WHERE LOWER(s2.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
              )
          )
    `;
    const binds = [];
    if (lineItemIdFilter) {
        sql += ` AND LOWER(f.LINE_ITEM_ID) = LOWER(?)`;
        binds.push(lineItemIdFilter);
    }
    const rs = snowflake.createStatement({ sqlText: sql, binds: binds }).execute();
    return (rs && rs.next()) ? (Number(rs.getColumnValue(1)) || 0) : 0;
}

function fetchLineItems() {
    let sql = `
        SELECT 
            LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
            BUY_TYPE, FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, ASSUME_SPEND,
            TO_VARCHAR(FIXED_COST_FROM, ''YYYY-MM-DD'') AS FIXED_COST_FROM,
            FIXED_COST_BURSTS_JSON
        FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
        WHERE (
            FIXED_COST_MEDIA = TRUE
            OR ASSUME_SPEND = TRUE
        )
    `;
    if (lineItemIdFilter) sql += ` AND LOWER(LINE_ITEM_ID) = LOWER(?)`;
    sql += ` QUALIFY ROW_NUMBER() OVER (PARTITION BY LINE_ITEM_ID ORDER BY SYNCED_AT DESC) = 1`;
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
            sourceTable: rs.getColumnValue(7),
            assumeSpend: rs.getColumnValue(8) === true,
            fixedCostFrom: rs.getColumnValue(9),
            fixedCostBurstsJson: rs.getColumnValue(10)
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
            durationDays: daysBetween(toDateString(b.startDate), toDateString(b.endDate)),
            assumedDailyCents: Array.isArray(b.assumedDailyCents) ? b.assumedDailyCents : []
        };
    });
}

// Formula kept so the set-based proc can be checked against it. The main loop does not call this.
function assumedSpendDailyData(burst) {
    const series = burst.assumedDailyCents || [];
    const reported = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const n = series.length;
    for (let i = 0; i < n; i++) {
        const point = series[i] || {};
        const day = toDateString(point.date);
        const cents = Number(point.cents);
        const reportedSpend = Number.isFinite(cents) ? cents / 100 : 0;
        const dayHasPassed = day <= todayStr;
        reported[day] = {
            reportedSpend: reportedSpend,
            actualSpend: 0,
            actualDeliverables: 0,
            shareToday: dayHasPassed ? safeDiv(i + 1, n) : 0,
            capApplied: ''assumed_spend'',
            isSquareup: false
        };
    }
    return reported;
}

function lineHasDeliveryFact(lineItemId) {
    const sql = `
        SELECT 1
        WHERE EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
        OR EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
        OR EXISTS (
            SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
            WHERE LOWER(LINE_ITEM_ID) = LOWER(?)
        )
    `;
    const stmt = snowflake.createStatement({
        sqlText: sql,
        binds: [lineItemId, lineItemId, lineItemId]
    });
    const rs = stmt.execute();
    return rs.next();
}

function deleteStaleAssumedSpendRows() {
    let sql = `
        DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
        WHERE f.CAP_APPLIED = ''assumed_spend''
          AND (
            NOT EXISTS (
              SELECT 1
              FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
              WHERE LOWER(s.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
                AND s.ASSUME_SPEND = TRUE
                AND s.SYNCED_AT = (
                  SELECT MAX(s2.SYNCED_AT)
                  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s2
                  WHERE LOWER(s2.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
                )
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
            OR EXISTS (
              SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT p
              WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
            )
          )
    `;
    const binds = [];
    if (lineItemIdFilter) {
        sql += ` AND LOWER(f.LINE_ITEM_ID) = LOWER(?)`;
        binds.push(lineItemIdFilter);
    }
    snowflake.createStatement({ sqlText: sql, binds: binds }).execute();
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

function computeBurstReportedSpends(burst, deliveryByDate, buyType, timeBasedOverride) {
    const fixedCost = (timeBasedOverride === true) ? true : isFixedCostBuyType(buyType);
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

function upsertBurstFact(lineItemId, burst, dailyData, today, buyType, timeBasedOverride) {
    const fixedCost = (timeBasedOverride === true) ? true : isFixedCostBuyType(buyType);

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
        ?::NUMBER AS BURSTS_DELIVERED_UNDER,
        ?::NUMBER::BOOLEAN AS IS_BACKFILL,
        ?::DATE AS FIXED_COST_FROM_APPLIED,
        ?::VARCHAR AS REPORT_BASIS_APPLIED
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
        FIXED_COST_FROM_APPLIED = IFF(s.IS_BACKFILL, s.FIXED_COST_FROM_APPLIED, t.FIXED_COST_FROM_APPLIED),
        REPORT_BASIS_APPLIED = IFF(s.IS_BACKFILL, s.REPORT_BASIS_APPLIED, t.REPORT_BASIS_APPLIED),
        LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
        IS_CURRENTLY_FIXED_COST, WAS_EVER_FIXED_COST,
        LINE_ITEM_TOTAL_BUDGET, LINE_ITEM_TOTAL_REPORTED, LINE_ITEM_TOTAL_ACTUAL, LINE_ITEM_VARIANCE,
        BURST_COUNT, BURSTS_DELIVERED_OVER, BURSTS_DELIVERED_UNDER,
        FIXED_COST_FROM_APPLIED, REPORT_BASIS_APPLIED,
        LAST_CALCULATED_AT
    ) VALUES (
        s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME,
        s.IS_CURRENTLY_FIXED_COST, s.IS_CURRENTLY_FIXED_COST,
        s.LINE_ITEM_TOTAL_BUDGET, s.LINE_ITEM_TOTAL_REPORTED, s.LINE_ITEM_TOTAL_ACTUAL, s.LINE_ITEM_VARIANCE,
        s.BURST_COUNT, s.BURSTS_DELIVERED_OVER, s.BURSTS_DELIVERED_UNDER,
        IFF(s.IS_BACKFILL, s.FIXED_COST_FROM_APPLIED, NULL), IFF(s.IS_BACKFILL, s.REPORT_BASIS_APPLIED, NULL),
        CURRENT_TIMESTAMP()
    )
`;

function upsertLineItemFact(lineItem, allBurstData, today, applied) {
    const fixedCost = (applied && applied.timeBased === true) ? true : isFixedCostBuyType(lineItem.buyType);

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
            burstIndices.length, burstsOver, burstsUnder,
            backfillMode ? 1 : 0,
            (applied && applied.fromDay) ? applied.fromDay : null,
            (applied && applied.basis) ? applied.basis : null
        ]
    });
    stmt.execute();
}

// =====================================================
// MAIN
// =====================================================

const today = new Date().toISOString().slice(0, 10);
deleteStaleAssumedSpendRows();
const staleFlagsCleared = clearStaleCurrentlyFixedCost();
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
    today: today,
    stale_fixed_cost_flags_cleared: staleFlagsCleared,
    net_basis_lines: 0,
    fixed_cost_from_lines: 0
};

for (const li of lineItems) {
    try {
        const assumeSpend = li.assumeSpend === true;
        if (assumeSpend) {
            // Single-line refresh delegates. The unfiltered window skips these lines.
            if (lineItemIdFilter) {
                snowflake.createStatement({
                    sqlText: "CALL ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY(''all'', ?)",
                    binds: [lineItemIdFilter]
                }).execute();
                result.line_items_processed += 1;
            }
            continue;
        }
        // B23: the net basis, Melbourne days and the date apply only when the
        // snapshot carries FIXED_COST_BURSTS_JSON (fixed_cost_report_net on).
        const netBursts = parseNetBursts(li.fixedCostBurstsJson);
        const netMode = netBursts !== null;
        const fromDay = (netMode && isIsoDay(li.fixedCostFrom)) ? li.fixedCostFrom : null;
        const lineTimeBased = isFixedCostBuyType(li.buyType) || (netMode && isPackageBuyType(li.buyType));
        const parsedBursts = parseBursts(li.burstsJson);
        const bursts = netMode ? applyNetBasis(parsedBursts, netBursts) : parsedBursts;
        if (netMode) result.net_basis_lines += 1;
        if (fromDay) result.fixed_cost_from_lines += 1;
        // CM360 direct digital lines: the actual before the date is the app estimate.
        let preEstimate = null;
        if (fromDay && ESTIMATE_SOURCE_TABLES.indexOf(li.sourceTable) >= 0) {
            preEstimate = cm360EstimateBeforeDay(li.lineItemId, li.buyType, bursts, fromDay);
        }
        const allBurstData = {};
        const dailyRowsForLineItem = [];
        const keptWindows = [];

        for (const fullBurst of bursts) {
            let dailyData;
            let burst = fullBurst;
            let burstTimeBased = lineTimeBased;
            if (assumeSpend) {
                dailyData = assumedSpendDailyData(burst);
            } else {
                const delivery = fetchDeliveryForBurst(
                    li.lineItemId, li.sourceTable, li.buyType,
                    fullBurst.startDate, fullBurst.endDate
                );
                if (fromDay) {
                    const portion = fixedCostPortion(fullBurst, fromDay, delivery, preEstimate);
                    if (!portion) continue;  // the burst ends before the date: actuals only
                    burst = portion.burst;
                    // Plan deliverables already met before the date: the rest is time based.
                    if (portion.kind === ''cut'' && !burstTimeBased && !(burst.calculatedValue > 0)) {
                        burstTimeBased = true;
                    }
                    dailyData = computeBurstReportedSpends(
                        burst, deliveryFromDay(delivery, burst.startDate), li.buyType, burstTimeBased
                    );
                } else {
                    dailyData = computeBurstReportedSpends(burst, delivery, li.buyType, lineTimeBased);
                }
            }
            allBurstData[burst.index] = { burst: burst, dailyData: dailyData, timeBased: burstTimeBased };
            keptWindows.push({ index: burst.index, startDate: burst.startDate, endDate: burst.endDate });

            // For fixed_cost and assumed spend, expectedDailyDeliverables is meaningless → 0
            const expectedDaily = (assumeSpend || burstTimeBased) ? 0 : safeDiv(burst.calculatedValue, burst.durationDays);

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

        // B23fix: also when the line goes back from net to gross (switch off).
        if (backfillMode && (netMode || lastBackfillWasNet(li.lineItemId))) {
            deleteRowsOutsideReported(li.lineItemId, keptWindows);
        }

        if (dailyRowsForLineItem.length > 0) {
            const upserted = batchUpsertDailyFacts(dailyRowsForLineItem);
            result.daily_rows_upserted += upserted;
            result.daily_batches += Math.ceil(dailyRowsForLineItem.length / DAILY_FACT_BATCH_SIZE);
        }

        for (const idx of Object.keys(allBurstData)) {
            const { burst, dailyData, timeBased } = allBurstData[idx];
            upsertBurstFact(li.lineItemId, burst, dailyData, today, li.buyType, timeBased);
            result.burst_rows_upserted += 1;
        }

        upsertLineItemFact(li, allBurstData, today, {
            timeBased: lineTimeBased,
            fromDay: fromDay,
            basis: netMode ? NET_BASIS : null
        });
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
