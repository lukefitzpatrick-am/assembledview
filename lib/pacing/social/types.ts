/**
 * Social pacing row types (S1).
 *
 * SocialPacingCampaignRow is the social analogue of SearchPacingCampaignRow.
 * Social uses RESULTS / VIDEO_3S_VIEWS in place of Search's CONVERSIONS / REVENUE.
 * deliverableMetric comes from mapDeliverableMetric; deliverableTarget is the sum
 * of burst calculatedValue for the line item.
 */

import type { KpiTargets, NormalisedBurst } from "@/lib/pacing/campaigns/types";
import type { DeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";

export type SocialPlatform = "meta" | "tiktok";

/**
 * Snowflake delivery metrics and KPI ratios reused at line-item, platform-campaign,
 * and ad-set levels (mirrors SearchPacingKpis carrying cpc/ctr/cpm on breakdowns).
 *
 * Frequency is intentionally absent from actuals: the social fact has no reach
 * column, so frequency can never get an actual.
 */
export type SocialPacingMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  videoViews: number;
  ctr: number | null; // SUM(clicks) / SUM(impressions) — decimal ratio; null if impressions = 0
  conversionRate: number | null; // SUM(results) / SUM(impressions) — decimal ratio; null if impressions = 0
  cpv: number | null; // SUM(spend) / SUM(videoViews) — dollars; null if videoViews = 0
  vtr: number | null; // SUM(videoViews) / SUM(impressions) — decimal ratio; null if impressions = 0
};

/** One ad set under a platform campaign. */
export type SocialAdSetBreakdown = SocialPacingMetrics & {
  entityId: string;
  entityName: string;
};

/** One platform campaign under a Xano line item, containing its ad sets. */
export type SocialPlatformCampaignBreakdown = SocialPacingMetrics & {
  campaignId: string;
  campaignName: string;
  adSets: SocialAdSetBreakdown[];
};

export type SocialPacingCampaignRow = {
  // --- Identity ---
  mbaNumber: string;
  mediaPlanVersionId: number; // media_plan_social.media_plan_version (Xano version row id)
  mediaPlanVersionNumber: number; // master.version_number
  lineItemId: string; // e.g. "candel001SO1"
  lineItemNumber: number; // media_plan_social.line_item
  xanoRowId: number; // media_plan_social.id

  // --- Xano scalars (social row + master) ---
  clientName: string; // master.mp_client_name
  campaignName: string; // master.mp_campaignname
  campaignStatus: string; // master.campaign_status (lowercased)
  campaignStartDate: string; // master.campaign_start_date
  campaignEndDate: string; // master.campaign_end_date
  brand: string | null; // versions.brand (if hydrated; may be null)
  platform: string;
  bidStrategy: string;
  buyType: string;
  creativeTargeting: string; // mapped to spreadsheet "Line Item Targeting"
  creative: string;
  buyingDemo: string;
  market: string;
  fixedCostMedia: boolean;
  clientPaysForMedia: boolean;
  budgetIncludesFees: boolean;

  // --- Social-specific ---
  socialPlatform: SocialPlatform;
  deliverableMetric: DeliverableMetric;
  deliverableTarget: number; // sum(burst.calculatedValue)

  // --- Derived from bursts_json ---
  lineItemStartDate: string | null; // YYYY-MM-DD, min(burst.startDate)
  lineItemEndDate: string | null; // YYYY-MM-DD, max(burst.endDate)
  totalLineItemBudget: number; // sum(burst.budget)
  totalBursts: number;
  bursts: NormalisedBurst[];
  currentBurstIndex: number | null; // null if today is outside all bursts
  currentBurst: NormalisedBurst | null;

  // --- Calculated pacing (Part 2: real values) ---
  lineItemStatus: "on-track" | "ahead" | "behind" | "no-data";
  burstDays: number | null;
  burstDaysRemaining: number | null;
  spendPerDayRemaining: number | null;
  spendRemainingCurrentBurst: number | null; // burstBudget - spendToDateCurrentBurst
  spendRemainingLineTotal: number | null; // totalLineItemBudget - spendToDateLineTotal

  // --- Snowflake spend pacing ---
  spendToDateLineTotal: number;
  spendToDateCurrentBurst: number;
  spendYesterday: number;

  // --- Snowflake actuals (line-item aggregated) ---
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  videoViews: number;
  deliverableActual: number; // value of whichever deliverableMetric applies

  /**
   * Target KPI values from campaign_kpi. null until joined in a later commit.
   * Frequency target has no matching actual — social facts have no reach column.
   */
  kpiTargets: KpiTargets | null;

  // --- Three-level breakdown for UI drill-down ---
  platformCampaigns: SocialPlatformCampaignBreakdown[];
};
