import "server-only";

import {
  fetchAllMasters,
  fetchCurrentVersionRowsForMasters,
} from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import type {
  DirectBurstRow,
  DirectBurstStatus,
  DirectCampaignGroup,
  DirectDailyPoint,
  DirectLineItemRow,
} from "@/lib/pacing/direct/types";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { querySnowflake } from "@/lib/snowflake/query";
import type { MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const ROLLING_WINDOW_DAYS = 3;

export type FetchDirectPacingRowsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
  /** When false (default), only IS_CURRENTLY_FIXED_COST. When true, include WAS_EVER_FIXED_COST. */
  includeHistorical: boolean;
};

type LineItemFactRow = {
  LINE_ITEM_ID: string;
  MBA_NUMBER: string | null;
  LINE_ITEM_NAME: string | null;
  IS_CURRENTLY_FIXED_COST: boolean | number | null;
  WAS_EVER_FIXED_COST: boolean | number | null;
  LINE_ITEM_TOTAL_BUDGET: number | null;
  LINE_ITEM_TOTAL_REPORTED: number | null;
  LINE_ITEM_TOTAL_ACTUAL: number | null;
  LINE_ITEM_VARIANCE: number | null;
  BURST_COUNT: number | null;
  BURSTS_DELIVERED_OVER: number | null;
  BURSTS_DELIVERED_UNDER: number | null;
  BUY_TYPE: string | null;
};

type BurstFactRow = {
  LINE_ITEM_ID: string;
  BURST_INDEX: number;
  BURST_START_DATE: string | null;
  BURST_END_DATE: string | null;
  BURST_BUDGET: number | null;
  BURST_EXPECTED_DELIVERABLES: number | null;
  BURST_ACTUAL_DELIVERABLES: number | null;
  BURST_DELIVERY_RATIO: number | null;
  BURST_REPORTED_SPEND: number | null;
  BURST_ACTUAL_PLATFORM_SPEND: number | null;
  BURST_VARIANCE: number | null;
  BURST_STATUS: string | null;
};

type DailyFactRow = {
  LINE_ITEM_ID: string;
  BURST_INDEX: number;
  DATE_DAY: string;
  REPORTED_SPEND: number | null;
  ACTUAL_PLATFORM_SPEND: number | null;
  ACTUAL_DELIVERABLES: number | null;
  EXPECTED_DAILY_DELIVERABLES: number | null;
  IS_SQUAREUP_DAY: boolean | number | null;
  IS_LOCKED: boolean | number | null;
  BUY_TYPE: string | null;
  CAP_APPLIED: string | null;
};

function num(v: number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: boolean | number | null | undefined): boolean {
  return v === true || v === 1;
}

function dateISO(v: unknown): string {
  return String(v ?? "").slice(0, 10);
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function parseBurstStatus(raw: string | null | undefined): DirectBurstStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    s === "pending" ||
    s === "in_progress" ||
    s === "completed" ||
    s === "completed_over" ||
    s === "completed_under"
  ) {
    return s;
  }
  return "pending";
}

function deriveLineItemStatus(bursts: DirectBurstRow[]): DirectLineItemRow["lineItemStatus"] {
  if (bursts.length === 0) return "pending";
  const statuses = new Set(bursts.map((b) => b.status));
  if (statuses.has("in_progress")) return "in_progress";
  if (statuses.size === 1) return bursts[0]!.status;
  if ([...statuses].every((s) => s === "pending")) return "pending";
  if ([...statuses].every((s) => s.startsWith("completed"))) {
    if (statuses.has("completed_over") && statuses.has("completed_under")) return "mixed";
    if (statuses.has("completed_over")) return "completed_over";
    if (statuses.has("completed_under")) return "completed_under";
    return "completed";
  }
  return "mixed";
}

/**
 * Days outside the proc's ROLLING_WINDOW_DAYS=3 are skipped on normal refresh
 * (see isLockedDay + `if (!backfillMode && locked) continue`). Shade those as locked
 * even when the fact's IS_LOCKED flag is still false from when the day was last written.
 */
function isOutsideRollingWindow(dateDay: string, asOfDate: string): boolean {
  const cutoff = addDaysISO(asOfDate, -(ROLLING_WINDOW_DAYS - 1));
  // diffDays >= 3 ⇔ day <= today - 3. Cutoff for "still recalculated" is today-2.
  // isLockedDay: diffDays >= 3 → locked. So unlocked when day > asOfDate - 3.
  const lockBefore = addDaysISO(asOfDate, -ROLLING_WINDOW_DAYS);
  return dateDay <= lockBefore;
}

async function queryLineItemFacts(includeHistorical: boolean): Promise<LineItemFactRow[]> {
  const filter = includeHistorical
    ? "WHERE COALESCE(WAS_EVER_FIXED_COST, FALSE) = TRUE OR COALESCE(IS_CURRENTLY_FIXED_COST, FALSE) = TRUE"
    : "WHERE COALESCE(IS_CURRENTLY_FIXED_COST, FALSE) = TRUE";

  const sql = `
    SELECT
      li.LINE_ITEM_ID,
      li.MBA_NUMBER,
      li.LINE_ITEM_NAME,
      li.IS_CURRENTLY_FIXED_COST,
      li.WAS_EVER_FIXED_COST,
      li.LINE_ITEM_TOTAL_BUDGET,
      li.LINE_ITEM_TOTAL_REPORTED,
      li.LINE_ITEM_TOTAL_ACTUAL,
      li.LINE_ITEM_VARIANCE,
      li.BURST_COUNT,
      li.BURSTS_DELIVERED_OVER,
      li.BURSTS_DELIVERED_UNDER,
      bt.BUY_TYPE
    FROM ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT li
    LEFT JOIN (
      SELECT LINE_ITEM_ID, MAX(BUY_TYPE) AS BUY_TYPE
      FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT
      GROUP BY LINE_ITEM_ID
    ) bt ON bt.LINE_ITEM_ID = li.LINE_ITEM_ID
    ${filter}
    ORDER BY li.MBA_NUMBER, li.LINE_ITEM_ID
  `;

  return querySnowflake<LineItemFactRow>(sql, [], { label: "fixed_cost_line_item_fact" });
}

async function queryBurstFacts(lineItemIds: string[]): Promise<BurstFactRow[]> {
  if (lineItemIds.length === 0) return [];
  const placeholders = lineItemIds.map(() => "?").join(", ");
  const sql = `
    SELECT
      LINE_ITEM_ID,
      BURST_INDEX,
      TO_VARCHAR(BURST_START_DATE, 'YYYY-MM-DD') AS BURST_START_DATE,
      TO_VARCHAR(BURST_END_DATE, 'YYYY-MM-DD') AS BURST_END_DATE,
      BURST_BUDGET,
      BURST_EXPECTED_DELIVERABLES,
      BURST_ACTUAL_DELIVERABLES,
      BURST_DELIVERY_RATIO,
      BURST_REPORTED_SPEND,
      BURST_ACTUAL_PLATFORM_SPEND,
      BURST_VARIANCE,
      BURST_STATUS
    FROM ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT
    WHERE LINE_ITEM_ID IN (${placeholders})
    ORDER BY LINE_ITEM_ID, BURST_INDEX
  `;
  return querySnowflake<BurstFactRow>(sql, lineItemIds, { label: "fixed_cost_burst_fact" });
}

async function queryDailyFacts(lineItemIds: string[]): Promise<DailyFactRow[]> {
  if (lineItemIds.length === 0) return [];
  const placeholders = lineItemIds.map(() => "?").join(", ");
  const sql = `
    SELECT
      LINE_ITEM_ID,
      BURST_INDEX,
      TO_VARCHAR(DATE_DAY, 'YYYY-MM-DD') AS DATE_DAY,
      REPORTED_SPEND,
      ACTUAL_PLATFORM_SPEND,
      ACTUAL_DELIVERABLES,
      EXPECTED_DAILY_DELIVERABLES,
      IS_SQUAREUP_DAY,
      IS_LOCKED,
      BUY_TYPE,
      CAP_APPLIED
    FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT
    WHERE LINE_ITEM_ID IN (${placeholders})
    ORDER BY LINE_ITEM_ID, DATE_DAY, BURST_INDEX
  `;
  return querySnowflake<DailyFactRow>(sql, lineItemIds, {
    label: "fixed_cost_reported_daily_fact",
  });
}

function buildDailySeries(
  rows: DailyFactRow[],
  asOfDate: string
): DirectDailyPoint[] {
  let reportedCum = 0;
  let actualCum = 0;
  let expectedCum = 0;
  const out: DirectDailyPoint[] = [];

  for (const r of rows) {
    const reported = num(r.REPORTED_SPEND);
    const actual = num(r.ACTUAL_PLATFORM_SPEND);
    const expected = num(r.EXPECTED_DAILY_DELIVERABLES);
    reportedCum += reported;
    actualCum += actual;
    expectedCum += expected;
    const dateDay = dateISO(r.DATE_DAY);
    out.push({
      dateDay,
      burstIndex: Number(r.BURST_INDEX) || 0,
      reportedSpend: reported,
      actualPlatformSpend: actual,
      actualDeliverables: num(r.ACTUAL_DELIVERABLES),
      expectedDailyDeliverables: expected,
      reportedCumulative: reportedCum,
      actualCumulative: actualCum,
      expectedCumulative: expectedCum,
      isSquareupDay: bool(r.IS_SQUAREUP_DAY),
      isLocked: bool(r.IS_LOCKED) || isOutsideRollingWindow(dateDay, asOfDate),
      buyType: String(r.BUY_TYPE ?? "").trim(),
      capApplied: String(r.CAP_APPLIED ?? "").trim(),
    });
  }

  return out;
}

/**
 * Direct fixed-cost pacing composer over FIXED_COST_* facts.
 * MBA → client/campaign via media_plan_master (same path as other pacing tabs).
 */
export async function fetchDirectPacingRows(
  args: FetchDirectPacingRowsArgs
): Promise<DirectCampaignGroup[]> {
  const lineFacts = await queryLineItemFacts(args.includeHistorical);
  if (lineFacts.length === 0) return [];

  const masters = await fetchAllMasters();
  const masterByMba = new Map<string, MediaPlanMaster>();
  for (const m of masters) {
    masterByMba.set(m.mba_number.trim().toLowerCase(), m);
  }

  // Brand from current version rows (optional enrichment).
  const relevantMasters = masters.filter((m) =>
    lineFacts.some(
      (li) => String(li.MBA_NUMBER ?? "").trim().toLowerCase() === m.mba_number.trim().toLowerCase()
    )
  );
  const versionByMba =
    relevantMasters.length > 0
      ? await fetchCurrentVersionRowsForMasters(relevantMasters)
      : new Map();

  const scopedFacts = lineFacts.filter((li) => {
    const mba = String(li.MBA_NUMBER ?? "")
      .trim()
      .toLowerCase();
    const master = masterByMba.get(mba);
    if (!master) return false;
    if (args.allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(master.mp_client_name);
      if (!slug || !args.allowedClientSlugs.has(slug)) return false;
    }
    return true;
  });

  if (scopedFacts.length === 0) return [];

  const lineItemIds = scopedFacts.map((li) => String(li.LINE_ITEM_ID).trim());
  const [burstFacts, dailyFacts] = await Promise.all([
    queryBurstFacts(lineItemIds),
    queryDailyFacts(lineItemIds),
  ]);

  const burstsByLine = new Map<string, BurstFactRow[]>();
  for (const b of burstFacts) {
    const id = String(b.LINE_ITEM_ID).trim();
    let bucket = burstsByLine.get(id);
    if (!bucket) {
      bucket = [];
      burstsByLine.set(id, bucket);
    }
    bucket.push(b);
  }

  const dailyByLine = new Map<string, DailyFactRow[]>();
  for (const d of dailyFacts) {
    const id = String(d.LINE_ITEM_ID).trim();
    let bucket = dailyByLine.get(id);
    if (!bucket) {
      bucket = [];
      dailyByLine.set(id, bucket);
    }
    bucket.push(d);
  }

  const groups = new Map<string, DirectCampaignGroup>();

  for (const li of scopedFacts) {
    const lineItemId = String(li.LINE_ITEM_ID).trim();
    const mba = String(li.MBA_NUMBER ?? "").trim();
    const mbaKey = mba.toLowerCase();
    const master = masterByMba.get(mbaKey)!;
    const version = versionByMba.get(mbaKey);

    const bursts: DirectBurstRow[] = (burstsByLine.get(lineItemId) ?? []).map((b) => ({
      burstIndex: Number(b.BURST_INDEX) || 0,
      startDate: dateISO(b.BURST_START_DATE),
      endDate: dateISO(b.BURST_END_DATE),
      budget: num(b.BURST_BUDGET),
      expectedDeliverables: num(b.BURST_EXPECTED_DELIVERABLES),
      actualDeliverables: num(b.BURST_ACTUAL_DELIVERABLES),
      deliveryRatio: num(b.BURST_DELIVERY_RATIO),
      reportedSpend: num(b.BURST_REPORTED_SPEND),
      actualPlatformSpend: num(b.BURST_ACTUAL_PLATFORM_SPEND),
      variance: num(b.BURST_VARIANCE),
      status: parseBurstStatus(b.BURST_STATUS),
    }));

    const dailyRaw = dailyByLine.get(lineItemId) ?? [];
    const buyTypeFromDaily = dailyRaw.find((d) => d.BUY_TYPE)?.BUY_TYPE;
    const buyType = String(li.BUY_TYPE ?? buyTypeFromDaily ?? "").trim();

    const totalReported = num(li.LINE_ITEM_TOTAL_REPORTED);
    const variance = num(li.LINE_ITEM_VARIANCE);
    const variancePct = totalReported > 0 ? variance / totalReported : null;

    const lineItem: DirectLineItemRow = {
      lineItemId,
      mbaNumber: mba,
      lineItemName: String(li.LINE_ITEM_NAME ?? "").trim() || lineItemId,
      buyType,
      isCurrentlyFixedCost: bool(li.IS_CURRENTLY_FIXED_COST),
      wasEverFixedCost: bool(li.WAS_EVER_FIXED_COST),
      totalBudget: num(li.LINE_ITEM_TOTAL_BUDGET),
      totalReported,
      totalActual: num(li.LINE_ITEM_TOTAL_ACTUAL),
      variance,
      variancePct,
      burstCount: num(li.BURST_COUNT) || bursts.length,
      burstsDeliveredOver: num(li.BURSTS_DELIVERED_OVER),
      burstsDeliveredUnder: num(li.BURSTS_DELIVERED_UNDER),
      lineItemStatus: deriveLineItemStatus(bursts),
      bursts,
      daily: buildDailySeries(dailyRaw, args.asOfDate),
    };

    let group = groups.get(mbaKey);
    if (!group) {
      group = {
        mbaNumber: master.mba_number,
        clientName: master.mp_client_name,
        campaignName: master.mp_campaignname,
        campaignStatus: master.campaign_status.trim().toLowerCase(),
        campaignStartDate: master.campaign_start_date,
        campaignEndDate: master.campaign_end_date,
        brand: version?.brand ?? null,
        lineItems: [],
        totalBudget: 0,
        totalReported: 0,
        totalActual: 0,
        variance: 0,
      };
      groups.set(mbaKey, group);
    }

    group.lineItems.push(lineItem);
    group.totalBudget += lineItem.totalBudget;
    group.totalReported += lineItem.totalReported;
    group.totalActual += lineItem.totalActual;
    group.variance += lineItem.variance;
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.clientName.localeCompare(b.clientName) || a.campaignName.localeCompare(b.campaignName)
  );
}
