import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { aggregateForLineItem } from "@/lib/pacing/campaigns/aggregate";
import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import type { KpiTargets, SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import { fetchCampaignKpisForMbas } from "@/lib/xano/campaignKpi";
import {
  computePacing,
  getMelbourneYesterdayISO,
  type PacingStatus,
} from "@/lib/pacing/maths";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { getSearchCampaignsPacingData } from "@/lib/snowflake/search-campaigns-pacing";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type FetchSearchPacingCampaignRowsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type GetLiveSearchLineItemsArgs = FetchSearchPacingCampaignRowsArgs;

export type LiveSearchLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  searchRow: Record<string, unknown>;
};

/**
 * Resolves live search line items (masters, versions, Xano search rows)
 * without Snowflake hydration.
 */
export async function resolveLiveSearchLineItemInputs(
  args: GetLiveSearchLineItemsArgs
): Promise<LiveSearchLineItemInput[]> {
  const masters = await fetchAllMasters();
  const liveMasters = masters.filter((m) => {
    if (!isLiveCampaignStatus(m.campaign_status)) return false;
    if (!m.campaign_start_date || !m.campaign_end_date) return false;
    if (args.asOfDate < m.campaign_start_date || args.asOfDate > m.campaign_end_date) return false;
    if (args.allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(m.mp_client_name);
      if (!slug || !args.allowedClientSlugs.has(slug)) return false;
    }
    return true;
  });

  if (liveMasters.length === 0) return [];

  const versionRowsByMba = await fetchCurrentVersionRowsForMasters(liveMasters);
  const inputs: LiveSearchLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/campaigns] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    const searchRows = await fetchSearchLineItemsForMba({
      mba_number: master.mba_number,
      versionRowId: versionRow.id,
      versionNumber: master.version_number,
    });

    for (const searchRow of searchRows) {
      const lineItemId = String(searchRow.line_item_id ?? searchRow.lineItemId ?? "").trim();
      if (!lineItemId) {
        console.warn("[pacing/campaigns] search row missing line_item_id", master.mba_number, searchRow.id);
        continue;
      }
      inputs.push({ master, versionRow, searchRow });
    }
  }

  return inputs;
}

export type VersionRow = {
  id: number;
  version_number: number;
  brand?: string | null;
};

function parseVersion(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toMaster(row: Record<string, unknown>): MediaPlanMaster | null {
  const mba = String(row.mba_number ?? "").trim();
  if (!mba) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    mba_number: mba,
    mp_client_name: String(row.mp_client_name ?? "").trim(),
    mp_campaignname: String(row.mp_campaignname ?? row.campaign_name ?? "").trim(),
    version_number: parseVersion(row.version_number),
    campaign_status: String(row.campaign_status ?? ""),
    campaign_start_date: String(row.campaign_start_date ?? "").trim().slice(0, 10),
    campaign_end_date: String(row.campaign_end_date ?? "").trim().slice(0, 10),
    mp_campaignbudget: Number(row.mp_campaignbudget ?? row.campaign_budget ?? 0) || 0,
    created_at: typeof row.created_at === "number" ? row.created_at : undefined,
  };
}

function filterByMbaAndVersion(
  items: unknown[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  const normalizedMba = norm(mbaNumber);
  const versionStr = String(versionNumber);
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? String(mediaPlanVersionId)
      : null;

  return items.filter((item) => {
    const row = item as Record<string, unknown>;
    if (norm(row.mba_number) !== normalizedMba) return false;

    const mpPlanNumber = row.mp_plannumber ?? row.mp_plan_number ?? row.mpPlanNumber;
    const mediaPlanVersion = row.media_plan_version;
    const mediaPlanVersionIdField = row.media_plan_version_id ?? row.media_plan_versionID;
    const versionNumberField = row.version_number;

    const hasVersionIdCandidate =
      (mediaPlanVersion !== null &&
        mediaPlanVersion !== undefined &&
        String(mediaPlanVersion).trim() !== "") ||
      (mediaPlanVersionIdField !== null &&
        mediaPlanVersionIdField !== undefined &&
        String(mediaPlanVersionIdField).trim() !== "");

    if (versionIdStr && hasVersionIdCandidate) {
      const candidates = [mediaPlanVersion, mediaPlanVersionIdField];
      return candidates.some((value) => String(value ?? "").trim() === versionIdStr);
    }

    const versionCandidates = [mpPlanNumber, versionNumberField];
    return versionCandidates.some((value) => String(value ?? "").trim() === versionStr);
  }) as Record<string, unknown>[];
}

export async function fetchAllMasters(): Promise<MediaPlanMaster[]> {
  const endpoints = ["media_plan_master", "media_plans_master"];
  for (const endpoint of endpoints) {
    try {
      const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS]);
      const raw = await fetchAllXanoPages(url, {}, `PACING_${endpoint}`, 200, 50);
      return (raw ?? [])
        .map((r) => toMaster(r as Record<string, unknown>))
        .filter((m): m is MediaPlanMaster => m !== null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) continue;
      throw err;
    }
  }
  return [];
}

export async function fetchCurrentVersionRowsForMasters(
  masters: MediaPlanMaster[]
): Promise<Map<string, VersionRow>> {
  const versionsUrl = xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS]);
  const allVersions = await fetchAllXanoPages(versionsUrl, {}, "PACING_VERSIONS_CAMPAIGNS", 200, 50);

  const wantMba = new Set(masters.map((m) => norm(m.mba_number)));
  const wantVersion = new Map(
    masters.map((m) => [norm(m.mba_number), m.version_number] as const)
  );

  const map = new Map<string, VersionRow>();
  for (const raw of allVersions ?? []) {
    const row = raw as Record<string, unknown>;
    const mba = norm(row.mba_number);
    if (!mba || !wantMba.has(mba)) continue;
    const versionNumber = parseVersion(row.version_number);
    if (versionNumber !== wantVersion.get(mba)) continue;
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const brand =
      row.brand !== undefined && row.brand !== null ? String(row.brand).trim() || null : null;
    map.set(mba, { id, version_number: versionNumber, brand });
  }
  return map;
}

export async function fetchSearchLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
}): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("media_plan_search", [...MEDIA_PLANS_KEYS]);
  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    { mba_number: args.mba_number, media_plan_version: args.versionRowId },
    { mba_number: args.mba_number, media_plan_version_id: args.versionRowId },
    { mba_number: args.mba_number, mp_plannumber: args.versionNumber },
    { mba_number: args.mba_number, version_number: args.versionNumber },
    { mba_number: args.mba_number, media_plan_version: args.versionNumber },
  ];

  let best: Record<string, unknown>[] = [];
  let bestRawCount = Number.POSITIVE_INFINITY;

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(url, params, "PACING_media_plan_search", 200, 20);
    const filtered = filterByMbaAndVersion(raw, args.mba_number, args.versionNumber, args.versionRowId);
    if (
      filtered.length > best.length ||
      (filtered.length === best.length && raw.length < bestRawCount)
    ) {
      best = filtered;
      bestRawCount = raw.length;
    }
    if (raw.length > 0 && raw.length === filtered.length) {
      break;
    }
  }

  return best;
}

function mapSearchRowToCampaignRow(
  master: MediaPlanMaster,
  versionRow: VersionRow,
  sr: Record<string, unknown>,
  asOfDate: string
): SearchPacingCampaignRow {
  const bursts = parseBurstsToNormalised(sr.bursts_json ?? sr.bursts);
  const lineItemStartDate = bursts.length > 0 ? bursts[0]!.startDate : null;
  const lineItemEndDate = bursts.length > 0 ? bursts[bursts.length - 1]!.endDate : null;
  const totalLineItemBudget = bursts.reduce((acc, b) => acc + b.budget, 0);
  const currentBurstIndex = findCurrentBurstIndex(bursts, asOfDate);
  const currentBurst = currentBurstIndex !== null ? bursts[currentBurstIndex]! : null;
  const burstDays = currentBurst
    ? inclusiveDaysBetween(currentBurst.startDate, currentBurst.endDate)
    : null;
  const burstDaysRemaining = currentBurst
    ? inclusiveDaysBetween(asOfDate, currentBurst.endDate)
    : null;
  const spendRemainingCurrentBurst = currentBurst ? currentBurst.budget : null;
  const spendRemainingLineTotal = totalLineItemBudget;
  const spendPerDayRemaining =
    spendRemainingCurrentBurst !== null && burstDaysRemaining && burstDaysRemaining > 0
      ? spendRemainingCurrentBurst / burstDaysRemaining
      : null;

  return {
    mbaNumber: master.mba_number,
    mediaPlanVersionId: versionRow.id,
    mediaPlanVersionNumber: master.version_number,
    lineItemId: String(sr.line_item_id ?? sr.lineItemId ?? "").trim().toLowerCase(),
    lineItemNumber: Number(sr.line_item ?? sr.lineItem ?? 0) || 0,
    xanoRowId: Number(sr.id) || 0,

    clientName: master.mp_client_name,
    campaignName: master.mp_campaignname,
    campaignStatus: master.campaign_status.trim().toLowerCase(),
    campaignStartDate: master.campaign_start_date,
    campaignEndDate: master.campaign_end_date,
    brand: versionRow.brand ?? null,
    platform: String(sr.platform ?? "").trim(),
    bidStrategy: String(sr.bid_strategy ?? sr.bidStrategy ?? "").trim(),
    buyType: String(sr.buy_type ?? sr.buyType ?? "").trim(),
    creativeTargeting: String(sr.creative_targeting ?? sr.creativeTargeting ?? "").trim(),
    creative: String(sr.creative ?? "").trim(),
    buyingDemo: String(sr.buying_demo ?? sr.buyingDemo ?? "").trim(),
    market: String(sr.market ?? "").trim(),
    fixedCostMedia: !!sr.fixed_cost_media,
    clientPaysForMedia: !!sr.client_pays_for_media,
    budgetIncludesFees: !!sr.budget_includes_fees,

    lineItemStartDate,
    lineItemEndDate,
    totalLineItemBudget,
    totalBursts: bursts.length,
    bursts,
    currentBurstIndex,
    currentBurst,

    lineItemStatus: "no-data",
    burstDays,
    burstDaysRemaining,
    spendPerDayRemaining,
    spendRemainingCurrentBurst,
    spendRemainingLineTotal,

    platformCampaigns: [],
    spendToDateCurrentBurst: 0,
    spendToDateLineTotal: 0,
    spendYesterday: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    cpc: null,
    ctr: null,
    cpm: null,

    kpiTargets: null,
  };
}

export async function fetchSearchPacingCampaignRows(
  args: FetchSearchPacingCampaignRowsArgs
): Promise<SearchPacingCampaignRow[]> {
  const inputs = await resolveLiveSearchLineItemInputs(args);
  const rows: SearchPacingCampaignRow[] = inputs.map(({ master, versionRow, searchRow }) =>
    mapSearchRowToCampaignRow(master, versionRow, searchRow, args.asOfDate)
  );

  if (rows.length === 0) return rows;

  // --- KPI targets (Feature 2a) ---
  const mbaVersionPairs = rows.map((r) => ({
    mbaNumber: r.mbaNumber,
    versionNumber: r.mediaPlanVersionNumber,
  }));
  const campaignKpiRows = await fetchCampaignKpisForMbas({ mbaVersionPairs });

  const kpiTargetsByKey = new Map<string, KpiTargets>();

  function makeKpiKey(mba: string, version: number, lineItemId: string): string {
    return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
  }

  for (const ck of campaignKpiRows) {
    const key = makeKpiKey(ck.mba_number, ck.version_number, ck.line_item_id);
    if (kpiTargetsByKey.has(key)) {
      console.warn(`[fetchSearchPacingCampaignRows] duplicate campaign_kpi for ${key}`);
    }
    kpiTargetsByKey.set(key, {
      mediaType: ck.media_type ?? null,
      publisher: ck.publisher ?? null,
      bidStrategy: ck.bid_strategy ?? null,
      ctr: ck.ctr,
      cpv: ck.cpv,
      conversionRate: ck.conversion_rate,
      vtr: ck.vtr,
      frequency: ck.frequency,
    });
  }

  for (const row of rows) {
    const key = makeKpiKey(row.mbaNumber, row.mediaPlanVersionNumber, row.lineItemId);
    row.kpiTargets = kpiTargetsByKey.get(key) ?? null;
  }

  // --- Snowflake hydration (Part 2) ---
  const lineItemIds = Array.from(new Set(rows.map((r) => r.lineItemId.toLowerCase())));
  const lineTotalStart =
    rows
      .map((r) => r.lineItemStartDate)
      .filter((d): d is string => !!d)
      .sort()[0] ?? args.asOfDate;
  const yesterday = getMelbourneYesterdayISO(args.asOfDate);

  const snowflakeRows = await getSearchCampaignsPacingData({
    lineItemIds,
    startDate: lineTotalStart,
    endDate: args.asOfDate,
  });

  const byLineItem = new Map<string, typeof snowflakeRows>();
  for (const sr of snowflakeRows) {
    const k = sr.LINE_ITEM_ID;
    let bucket = byLineItem.get(k);
    if (!bucket) {
      bucket = [];
      byLineItem.set(k, bucket);
    }
    bucket.push(sr);
  }

  for (const row of rows) {
    const k = row.lineItemId.toLowerCase();
    const matched = byLineItem.get(k) ?? [];
    const { lineItemKpis, platformCampaigns } = aggregateForLineItem(matched, {
      lineTotalStart: row.lineItemStartDate ?? lineTotalStart,
      lineTotalEnd: args.asOfDate,
      currentBurstStart: row.currentBurst?.startDate ?? null,
      currentBurstEnd: row.currentBurst?.endDate ?? null,
      yesterday,
    });

    Object.assign(row, lineItemKpis);
    row.platformCampaigns = platformCampaigns;

    row.spendRemainingCurrentBurst =
      row.currentBurst !== null
        ? row.currentBurst.budget - lineItemKpis.spendToDateCurrentBurst
        : null;
    row.spendRemainingLineTotal = row.totalLineItemBudget - lineItemKpis.spendToDateLineTotal;
    row.spendPerDayRemaining =
      row.spendRemainingCurrentBurst !== null &&
      row.burstDaysRemaining !== null &&
      row.burstDaysRemaining > 0
        ? row.spendRemainingCurrentBurst / row.burstDaysRemaining
        : null;

    if (row.currentBurst === null) {
      row.lineItemStatus = "no-data";
    } else {
      const mathsOutput = computePacing({
        lineItemBudget: row.currentBurst.budget,
        startDate: row.currentBurst.startDate,
        endDate: row.currentBurst.endDate,
        spendToDate: lineItemKpis.spendToDateCurrentBurst,
        spendYesterday: lineItemKpis.spendYesterday,
        impressionsToDate: lineItemKpis.impressions,
        clicksToDate: lineItemKpis.clicks,
        conversionsToDate: lineItemKpis.conversions,
        revenueToDate: lineItemKpis.revenue,
        asOfDate: args.asOfDate,
      });
      row.lineItemStatus = lineItemStatusFromPacing(mathsOutput.status);
    }
  }

  return rows;
}

/** Maps 7-state computePacing output to the 4-state campaigns table pill. */
function lineItemStatusFromPacing(
  status: PacingStatus
): SearchPacingCampaignRow["lineItemStatus"] {
  if (status === "on_track" || status === "completed") return "on-track";
  if (status === "not_started") return "no-data";
  if (status === "slightly_under" || status === "under_pacing" || status === "no_delivery") {
    return "behind";
  }
  if (status === "slightly_over" || status === "over_pacing") return "ahead";
  return "no-data";
}
