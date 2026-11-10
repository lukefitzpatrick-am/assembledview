/**
 * Ad Serving (CM360) pacing row types — delivery counts on this DTO.
 * Counts are CM360 verification, plus partner-reported delivery for a
 * Direct Booked line whose publisher is a partner feed (Channel Factory
 * Digital Video, B32), marked by `deliverySource`.
 * Direct digital dollars are estimated later by `estimateDirectDigitalSpend`
 * (campaign delivery and the portfolio assembler). This row stays
 * `serving | no-data` and does not run `computePacing`.
 * Programmatic `derive_spend_from_plan` is a different path and stays modelled.
 */

import type { NormalisedBurst } from "@/lib/pacing/campaigns/types";

export type AdServingChannelFamily =
  | "digitalDisplay"
  | "digitalVideo"
  | "digitalAudio"
  | "bvod";

/** Delivery-based status only — never spend/budget variance. */
export type AdServingLineItemStatus = "serving" | "no-data";

/**
 * B32: where a row's counts came from when they include partner-file rows.
 * `partner_file`: Channel Factory partner-reported rows only (CM360 rows, if
 * any, had no delivery). `partner_file_and_cm360`: both delivered and the
 * counts are their sum (the dashboard rule, C-182). Unset: CM360 only.
 */
export type AdServingDeliverySource = "partner_file" | "partner_file_and_cm360";

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
  /**
   * Campaign ended before the view day; listed for ENDED_CAMPAIGN_LISTED_DAYS
   * after its end date (`lib/pacing/endedCampaigns.ts`). Status is line spend
   * ÷ line budget over the full flight.
   */
  campaignEnded?: boolean;
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

  /** Delivery-based only: "serving" when any CM360 (or B32 partner-file) rows matched; else "no-data". */
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

  /** True when the plan budget is gross. Omitted on older fixtures. */
  budgetIncludesFees?: boolean;

  /**
   * P14: a package line with `expert_package_quantity` on. No unit target on
   * the line or its bursts, and no CM360 estimate. Omitted otherwise.
   */
  noUnitTarget?: true;

  /**
   * B32: plan publisher, trimmed. Set only on a Channel Factory Digital Video
   * line (`isDirectDigitalPartnerFileLine`); every other row omits it and is
   * unchanged.
   */
  publisher?: string;

  /** B32: set only when the counts include Channel Factory partner-file rows. */
  deliverySource?: AdServingDeliverySource;
};
