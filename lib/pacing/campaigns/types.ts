/**
 * Row type for the /pacing/campaigns page (Stage 1 Search).
 *
 * One row per Xano media_plan_search line item under a live media_plan_master.
 * Snowflake-sourced fields are stubbed at 0 / null in Part 1 and populated in Part 2.
 */
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

  // --- Calculated (Part 1, no Snowflake) ---
  lineItemStatus: "on-track" | "ahead" | "behind" | "no-data"; // always "no-data" in Part 1
  burstDays: number | null;
  burstDaysRemaining: number | null;
  spendPerDayRemaining: number | null;
  spendRemainingCurrentBurst: number | null;
  spendRemainingLineTotal: number | null;

  // --- Snowflake stubs (Part 2) ---
  platformCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    adGroups: Array<{ platformLineItemId: string; lineItemName: string }>;
  }>;
  spendToDateCurrentBurst: number; // 0
  spendToDateLineTotal: number; // 0
  spendYesterday: number; // 0
  impressions: number; // 0
  clicks: number; // 0
  conversions: number; // 0
  revenue: number | null; // null
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
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
