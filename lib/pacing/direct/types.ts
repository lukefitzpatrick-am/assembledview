/**
 * Direct (fixed-cost) pacing types.
 *
 * BURST_STATUS vocabulary from SP_REFRESH_FIXED_COST_REPORTED_DAILY:
 *   pending | in_progress | completed | completed_over | completed_under
 *
 * REPORTED_SPEND = finance-smoothed spend (even daily for buy_type=fixed_cost;
 *   delivery-shaped with 0.5–1.3 caps for cpm/cpc/cpv/cpa).
 * ACTUAL_PLATFORM_SPEND = SUM(AMOUNT_SPENT) from platform pacing facts.
 * VARIANCE = reported − actual (positive ⇒ reported ahead of platform).
 */

export type DirectBurstStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "completed_over"
  | "completed_under";

export type DirectBurstRow = {
  burstIndex: number;
  startDate: string;
  endDate: string;
  budget: number;
  expectedDeliverables: number;
  actualDeliverables: number;
  deliveryRatio: number;
  reportedSpend: number;
  actualPlatformSpend: number;
  variance: number;
  status: DirectBurstStatus;
};

export type DirectDailyPoint = {
  dateDay: string;
  burstIndex: number;
  reportedSpend: number;
  actualPlatformSpend: number;
  actualDeliverables: number;
  expectedDailyDeliverables: number;
  /** Cumulative reported spend through this day (within the line item series). */
  reportedCumulative: number;
  /** Cumulative actual platform spend through this day. */
  actualCumulative: number;
  /** Cumulative expected daily deliverables (0 for buy_type=fixed_cost). */
  expectedCumulative: number;
  isSquareupDay: boolean;
  /**
   * Fact column IS_LOCKED (true mainly after backfill). Also true when the day
   * is outside the proc's 3-day rolling recalc window relative to asOfDate.
   */
  isLocked: boolean;
  buyType: string;
  capApplied: string;
};

export type DirectLineItemRow = {
  lineItemId: string;
  mbaNumber: string;
  lineItemName: string;
  buyType: string;
  isCurrentlyFixedCost: boolean;
  wasEverFixedCost: boolean;
  totalBudget: number;
  totalReported: number;
  totalActual: number;
  /** reported − actual */
  variance: number;
  /** variance / reported when reported > 0; else null */
  variancePct: number | null;
  burstCount: number;
  burstsDeliveredOver: number;
  burstsDeliveredUnder: number;
  /** Derived from burst statuses for the table status chip. */
  lineItemStatus: DirectBurstStatus | "mixed";
  bursts: DirectBurstRow[];
  daily: DirectDailyPoint[];
};

export type DirectCampaignGroup = {
  mbaNumber: string;
  clientName: string;
  campaignName: string;
  campaignStatus: string;
  campaignStartDate: string;
  campaignEndDate: string;
  brand: string | null;
  lineItems: DirectLineItemRow[];
  totalBudget: number;
  totalReported: number;
  totalActual: number;
  variance: number;
};
