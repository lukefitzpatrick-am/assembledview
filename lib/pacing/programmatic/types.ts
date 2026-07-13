/**
 * Programmatic pacing row types — Social analogue for PACING_FACT media buys
 * (DV360 + Taboola via programmatic channel filters).
 */

import type { KpiTargets, NormalisedBurst } from "@/lib/pacing/campaigns/types";
import type { DeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";

/** Plan-side channel family (Xano container). */
export type ProgrammaticChannelFamily =
  | "progDisplay"
  | "progVideo"
  | "progBvod"
  | "progAudio"
  | "progOoh";

/** Snowflake queryPacingFact channel used to hydrate actuals. */
export type ProgrammaticSnowflakeChannel = "programmatic-display" | "programmatic-video";

export type ProgrammaticPacingMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  videoViews: number;
  ctr: number | null;
  conversionRate: number | null;
  /** SUM(spend) / SUM(impressions) * 1000 — null if impressions = 0 */
  cpm: number | null;
  /** SUM(spend) / SUM(videoViews) — null if videoViews = 0 */
  cpv: number | null;
  vtr: number | null;
};

export type ProgrammaticEntityBreakdown = ProgrammaticPacingMetrics & {
  entityId: string;
  entityName: string;
};

export type ProgrammaticPlatformCampaignBreakdown = ProgrammaticPacingMetrics & {
  campaignId: string;
  campaignName: string;
  entities: ProgrammaticEntityBreakdown[];
};

export type ProgrammaticPacingCampaignRow = {
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
  /** Derived label: DV360 / Taboola / raw platform when known. */
  platformLabel: string;
  bidStrategy: string;
  buyType: string;
  creativeTargeting: string;
  creative: string;
  buyingDemo: string;
  market: string;
  fixedCostMedia: boolean;
  clientPaysForMedia: boolean;
  budgetIncludesFees: boolean;

  channelFamily: ProgrammaticChannelFamily;
  snowflakeChannel: ProgrammaticSnowflakeChannel;
  deliverableMetric: DeliverableMetric;
  deliverableTarget: number;

  lineItemStartDate: string | null;
  lineItemEndDate: string | null;
  totalLineItemBudget: number;
  totalBursts: number;
  bursts: NormalisedBurst[];
  currentBurstIndex: number | null;
  currentBurst: NormalisedBurst | null;

  lineItemStatus: "on-track" | "ahead" | "behind" | "no-data";
  burstDays: number | null;
  burstDaysRemaining: number | null;
  spendPerDayRemaining: number | null;
  spendRemainingCurrentBurst: number | null;
  spendRemainingLineTotal: number | null;

  spendToDateLineTotal: number;
  spendToDateCurrentBurst: number;
  spendYesterday: number;

  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  videoViews: number;
  deliverableActual: number;
  ctr: number | null;
  conversionRate: number | null;
  cpm: number | null;
  cpv: number | null;
  vtr: number | null;

  kpiTargets: KpiTargets | null;

  platformCampaigns: ProgrammaticPlatformCampaignBreakdown[];
};
