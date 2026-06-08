import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import {
  fetchAllMasters,
  fetchCurrentVersionRowsForMasters,
  type VersionRow,
} from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import type { SocialPacingCampaignRow, SocialPlatform } from "@/lib/pacing/social/types";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type GetLiveSocialLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type LiveSocialLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  socialRow: Record<string, unknown>;
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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

export async function fetchSocialLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
}): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("media_plan_social", [...MEDIA_PLANS_KEYS]);
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
    const raw = await fetchAllXanoPages(url, params, "PACING_media_plan_social", 200, 20);
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

// Platform classification mirrors components/dashboard/delivery/DeliveryDataProviderWrapper.tsx
// (classifySocialPacingPlatform). Dedupe when a shared module exists.
function isMetaPlatformString(value: unknown): boolean {
  return /\b(meta|facebook|instagram|ig)\b/i.test(String(value ?? ""));
}

function isTikTokPlatformString(value: unknown): boolean {
  return /\btik\s*tok\b/i.test(String(value ?? ""));
}

function classifySocialPacingPlatform(row: Record<string, unknown>): SocialPlatform | null {
  const platform = String(row.platform ?? "").trim();
  if (platform) {
    if (isMetaPlatformString(platform)) return "meta";
    if (isTikTokPlatformString(platform)) return "tiktok";
  }
  const fallbackName = String(
    row.line_item_name ??
      row.lineItemName ??
      row.creative_targeting ??
      row.creativeTargeting ??
      row.creative ??
      ""
  )
    .trim()
    .toUpperCase();
  if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(fallbackName)) return "meta";
  if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(fallbackName)) return "tiktok";
  return null;
}

/**
 * Resolves live social line items (masters, versions, Xano social rows)
 * without Snowflake hydration.
 */
export async function resolveLiveSocialLineItemInputs(
  args: GetLiveSocialLineItemsArgs
): Promise<LiveSocialLineItemInput[]> {
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
  const inputs: LiveSocialLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/social] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    const socialRows = await fetchSocialLineItemsForMba({
      mba_number: master.mba_number,
      versionRowId: versionRow.id,
      versionNumber: master.version_number,
    });

    for (const socialRow of socialRows) {
      const lineItemId = String(socialRow.line_item_id ?? socialRow.lineItemId ?? "").trim();
      if (!lineItemId) {
        console.warn(
          "[pacing/social] social row missing line_item_id",
          master.mba_number,
          socialRow.id
        );
        continue;
      }
      inputs.push({ master, versionRow, socialRow });
    }
  }

  return inputs;
}

function mapSocialRowToCampaignRow(
  master: MediaPlanMaster,
  versionRow: VersionRow,
  sr: Record<string, unknown>,
  asOfDate: string
): SocialPacingCampaignRow | null {
  const socialPlatform = classifySocialPacingPlatform(sr);
  if (!socialPlatform) {
    console.warn(
      "[pacing/social] social row missing recognisable platform",
      master.mba_number,
      sr.id,
      sr.platform
    );
    return null;
  }

  const bursts = parseBurstsToNormalised(sr.bursts_json ?? sr.bursts);
  const lineItemStartDate = bursts.length > 0 ? bursts[0]!.startDate : null;
  const lineItemEndDate = bursts.length > 0 ? bursts[bursts.length - 1]!.endDate : null;
  const totalLineItemBudget = bursts.reduce((acc, b) => acc + b.budget, 0);
  const deliverableTarget = bursts.reduce((acc, b) => acc + b.calculatedValue, 0);
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

  const platform = String(sr.platform ?? "").trim();
  const buyType = String(sr.buy_type ?? sr.buyType ?? "").trim();

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
    platform,
    bidStrategy: String(sr.bid_strategy ?? sr.bidStrategy ?? "").trim(),
    buyType,
    creativeTargeting: String(sr.creative_targeting ?? sr.creativeTargeting ?? "").trim(),
    creative: String(sr.creative ?? "").trim(),
    buyingDemo: String(sr.buying_demo ?? sr.buyingDemo ?? "").trim(),
    market: String(sr.market ?? "").trim(),
    fixedCostMedia: !!sr.fixed_cost_media,
    clientPaysForMedia: !!sr.client_pays_for_media,
    budgetIncludesFees: !!sr.budget_includes_fees,

    socialPlatform,
    deliverableMetric: mapDeliverableMetric({ channel: "social", buyType, platform }),
    deliverableTarget,

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

    spendToDateLineTotal: 0,
    spendToDateCurrentBurst: 0,
    spendYesterday: 0,

    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    videoViews: 0,
    deliverableActual: 0,

    platformCampaigns: [],
  };
}

/**
 * Maps live social line items to plan-side SocialPacingCampaignRow fields.
 * Snowflake actuals and pacing status are left at defaults (filled by S3b).
 */
export async function resolveLiveSocialPacingCampaignRows(
  args: GetLiveSocialLineItemsArgs
): Promise<SocialPacingCampaignRow[]> {
  const inputs = await resolveLiveSocialLineItemInputs(args);
  const rows: SocialPacingCampaignRow[] = [];

  for (const { master, versionRow, socialRow } of inputs) {
    const row = mapSocialRowToCampaignRow(master, versionRow, socialRow, args.asOfDate);
    if (row) rows.push(row);
  }

  return rows;
}
