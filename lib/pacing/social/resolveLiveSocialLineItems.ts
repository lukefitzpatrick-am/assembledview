import "server-only";

import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import { type VersionRow } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import {
  fetchXanoLineItemsForMba,
  resolveLivePlanLineItems,
} from "@/lib/pacing/plans/resolveLivePlanLineItems";
import { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";
import { type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

export { classifySocialPacingPlatform } from "@/lib/pacing/social/classifySocialPacingPlatform";

const SOCIAL_ENDPOINT = "media_plan_social";

export type GetLiveSocialLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type LiveSocialLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  socialRow: Record<string, unknown>;
};

export async function fetchSocialLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
}): Promise<Record<string, unknown>[]> {
  return fetchXanoLineItemsForMba({
    ...args,
    tableName: SOCIAL_ENDPOINT,
  });
}

/**
 * Resolves live social line items (masters, versions, Xano social rows)
 * without Snowflake hydration.
 */
export async function resolveLiveSocialLineItemInputs(
  args: GetLiveSocialLineItemsArgs
): Promise<LiveSocialLineItemInput[]> {
  const rows = await resolveLivePlanLineItems({
    endpoints: [SOCIAL_ENDPOINT],
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    channelLabel: "social",
  });
  return rows.map((row) => ({
    master: row.master,
    versionRow: row.versionRow,
    socialRow: row.lineItem,
  }));
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

    ctr: null,
    conversionRate: null,
    cpv: null,
    vtr: null,

    kpiTargets: null,

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
