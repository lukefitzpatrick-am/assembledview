/**
 * Row type for the /pacing/search page (Stage 1 Search).
 *
 * One row per Xano media_plan_search line item under a live media_plan_master.
 * Snowflake-sourced fields populated in Part 2 via composer hydration.
 */

/** KPI bundle reused at line-item, platform-campaign, and ad-group levels. */
export type SearchPacingKpis = {
  spendToDateLineTotal: number;
  spendToDateCurrentBurst: number;
  spendYesterday: number;
  impressions: number; // line-total across all dates in range
  clicks: number;
  conversions: number;
  revenue: number;
  cpc: number | null; // SUM(spend) / SUM(clicks) — null if clicks = 0
  ctr: number | null; // SUM(clicks) / SUM(impressions) — null if impressions = 0
  cpm: number | null; // SUM(spend) / SUM(impressions) * 1000 — null if impressions = 0
};

/** One ad group under a platform campaign. */
export type AdGroupBreakdown = SearchPacingKpis & {
  platformLineItemId: string; // SEARCH_PACING_FACT.PLATFORM_LINE_ITEM_ID
  lineItemName: string; // SEARCH_PACING_FACT.LINE_ITEM_NAME (platform-side label)
};

/** One platform campaign under a Xano line item, containing its ad groups. */
export type PlatformCampaignBreakdown = SearchPacingKpis & {
  campaignId: string; // SEARCH_PACING_FACT.CAMPAIGN_ID
  campaignName: string; // SEARCH_PACING_FACT.CAMPAIGN_NAME
  adGroups: AdGroupBreakdown[];
};

export type SearchPacingCampaignRow = {
  // --- Identity ---
  mbaNumber: string;
  mediaPlanVersionId: number; // media_plan_search.media_plan_version (Xano version row id)
  mediaPlanVersionNumber: number; // master.version_number
  lineItemId: string; // e.g. "candel001SE1"
  lineItemNumber: number; // media_plan_search.line_item
  xanoRowId: number; // media_plan_search.id

  // --- Xano scalars (search row + master) ---
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

  // --- Snowflake KPIs (line-item aggregated) ---
  spendToDateLineTotal: number;
  spendToDateCurrentBurst: number;
  spendYesterday: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;

  // --- Three-level breakdown for UI drill-down ---
  platformCampaigns: PlatformCampaignBreakdown[];
};

export type NormalisedBurst = {
  index: number; // 0-based
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  budget: number;
  buyAmount: number;
  calculatedValue: number;
  mediaAmount?: number;
  feeAmount?: number;
};
