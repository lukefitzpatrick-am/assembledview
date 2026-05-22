import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type FetchSearchPacingCampaignRowsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

type VersionRow = {
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

async function fetchAllMasters(): Promise<MediaPlanMaster[]> {
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

async function fetchCurrentVersionRowsForMasters(
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

async function fetchSearchLineItemsForMba(args: {
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
    revenue: 0, // TODO Part 2: populated from Snowflake
    cpc: null,
    ctr: null,
    cpm: null,
  };
}

export async function fetchSearchPacingCampaignRows(
  args: FetchSearchPacingCampaignRowsArgs
): Promise<SearchPacingCampaignRow[]> {
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
  const rows: SearchPacingCampaignRow[] = [];

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

    for (const sr of searchRows) {
      const lineItemId = String(sr.line_item_id ?? sr.lineItemId ?? "").trim();
      if (!lineItemId) {
        console.warn("[pacing/campaigns] search row missing line_item_id", master.mba_number, sr.id);
        continue;
      }
      rows.push(mapSearchRowToCampaignRow(master, versionRow, sr, args.asOfDate));
    }
  }

  return rows;
}
