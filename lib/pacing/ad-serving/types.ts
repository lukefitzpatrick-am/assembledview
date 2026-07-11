/**
 * Ad Serving (CM360) pacing row types — verification counts only.
 * Zero-spend law: no budget variance, no computePacing spend status, no $ columns.
 */

import type { NormalisedBurst } from "@/lib/pacing/campaigns/types";

export type AdServingChannelFamily =
  | "digitalDisplay"
  | "digitalVideo"
  | "digitalAudio"
  | "bvod";

/** Delivery-based status only — never spend/budget variance. */
export type AdServingLineItemStatus = "serving" | "no-data";

export type AdServingPacingCampaignRow = {
  mbaNumber: string;
  mediaPlanVersionId: number;
  mediaPlanVersionNumber: number;
  lineItemId: string;
  lineItemNumber: number;
  xanoRowId: number;

  clientName: string;
  campaignName: string;
  campaignStatus: string;
  campaignStartDate: string;
  campaignEndDate: string;
  brand: string | null;
  platform: string;
  bidStrategy: string;
  buyType: string;
  creativeTargeting: string;
  creative: string;
  buyingDemo: string;
  market: string;

  channelFamily: AdServingChannelFamily;

  lineItemStartDate: string | null;
  lineItemEndDate: string | null;
  totalBursts: number;
  bursts: NormalisedBurst[];
  currentBurstIndex: number | null;
  currentBurst: NormalisedBurst | null;

  /** Delivery-based only: "serving" when any CM360 rows matched; else "no-data". */
  lineItemStatus: AdServingLineItemStatus;

  /** Plan deliverable goals from bursts (impressions for CPM buys, clicks for CPC/CPA/CPL). */
  plannedImpressions: number;
  plannedClicks: number;

  impressions: number;
  clicks: number;
  /** clicks / impressions — null when impressions = 0 */
  ctr: number | null;
  videoCompletes: number;
  results: number;
  /** Distinct DATE_DAY count with any delivery in the line-total window. */
  daysActive: number;

  /**
   * Progress vs plan deliverable when a goal exists (0–1 clamped).
   * Prefer impressions goal; else clicks. null when no plan goal.
   */
  deliverableProgress: number | null;
  deliverableActual: number;
  deliverableTarget: number;
  deliverableKind: "impressions" | "clicks" | null;
};
