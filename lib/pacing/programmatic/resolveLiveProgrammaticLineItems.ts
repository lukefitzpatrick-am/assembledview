import "server-only";

import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import { type VersionRow } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import {
  fetchXanoLineItemsForMba,
  resolveLivePlanLineItems,
} from "@/lib/pacing/plans/resolveLivePlanLineItems";
import {
  PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL,
  type ProgrammaticChannelFamily,
  type ProgrammaticPacingCampaignRow,
  type ProgrammaticSnowflakeChannel,
} from "@/lib/pacing/programmatic/types";
import { type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

export type GetLiveProgrammaticLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
  mbaNumber?: string;
};

export type LiveProgrammaticLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  progRow: Record<string, unknown>;
  channelFamily: ProgrammaticChannelFamily;
  snowflakeChannel: ProgrammaticSnowflakeChannel;
};

type ProgTableSpec = {
  tableName: string;
  channelFamily: ProgrammaticChannelFamily;
  snowflakeChannel: ProgrammaticSnowflakeChannel;
};

/** Xano media_plan_prog_* tables — confirmed in MEDIA_PLAN_TABLES / proxy allowlist. */
const PROG_TABLES: ProgTableSpec[] = [
  {
    tableName: "media_plan_prog_display",
    channelFamily: "progDisplay",
    snowflakeChannel: PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progDisplay,
  },
  {
    tableName: "media_plan_prog_video",
    channelFamily: "progVideo",
    snowflakeChannel: PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progVideo,
  },
  {
    tableName: "media_plan_prog_bvod",
    channelFamily: "progBvod",
    snowflakeChannel: PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progBvod,
  },
  {
    tableName: "media_plan_prog_audio",
    channelFamily: "progAudio",
    snowflakeChannel: PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progAudio,
  },
  {
    tableName: "media_plan_prog_ooh",
    channelFamily: "progOoh",
    snowflakeChannel: PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progOoh,
  },
];

export async function fetchProgrammaticLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
  tableName: string;
}): Promise<Record<string, unknown>[]> {
  return fetchXanoLineItemsForMba(args);
}

/**
 * Platform label for the campaigns table — DV360 / Taboola when derivable
 * from plan platform or entity/campaign naming; else raw platform.
 */
export function deriveProgrammaticPlatformLabel(args: {
  platform: string;
  campaignName?: string | null;
  entityName?: string | null;
  lineItemName?: string | null;
}): string {
  const hay = [
    args.platform,
    args.campaignName,
    args.entityName,
    args.lineItemName,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .join(" ");

  if (/\btaboola\b|\bnative\b/.test(hay)) return "Taboola";
  if (
    /\bdv360\b|\bdisplay\s*video\b|\byoutube\s*[- ]?\s*dv360\b|\byoutube-dv360\b/.test(
      hay
    )
  ) {
    return "DV360";
  }
  const platform = args.platform.trim();
  return platform || "Programmatic";
}

/**
 * Resolves live programmatic line items across the prog* channel family
 * without Snowflake hydration.
 */
export async function resolveLiveProgrammaticLineItemInputs(
  args: GetLiveProgrammaticLineItemsArgs
): Promise<LiveProgrammaticLineItemInput[]> {
  const specByEndpoint = new Map(PROG_TABLES.map((spec) => [spec.tableName, spec]));
  const rows = await resolveLivePlanLineItems({
    endpoints: PROG_TABLES.map((spec) => spec.tableName),
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    mbaNumber: args.mbaNumber,
    channelLabel: "programmatic",
  });

  const inputs: LiveProgrammaticLineItemInput[] = [];
  for (const row of rows) {
    const spec = specByEndpoint.get(row.endpoint);
    if (!spec) continue;
    inputs.push({
      master: row.master,
      versionRow: row.versionRow,
      progRow: row.lineItem,
      channelFamily: spec.channelFamily,
      snowflakeChannel: spec.snowflakeChannel,
    });
  }
  return inputs;
}

function mapProgRowToCampaignRow(
  master: MediaPlanMaster,
  versionRow: VersionRow,
  pr: Record<string, unknown>,
  asOfDate: string,
  channelFamily: ProgrammaticChannelFamily,
  snowflakeChannel: ProgrammaticSnowflakeChannel
): ProgrammaticPacingCampaignRow {
  const bursts = parseBurstsToNormalised(pr.bursts_json ?? pr.bursts);
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

  const platform = String(pr.platform ?? "").trim();
  const buyType = String(pr.buy_type ?? pr.buyType ?? "").trim();
  const lineItemName = String(
    pr.line_item_name ?? pr.lineItemName ?? pr.creative_targeting ?? ""
  ).trim();

  return {
    mbaNumber: master.mba_number,
    mediaPlanVersionId: versionRow.id,
    mediaPlanVersionNumber: master.version_number,
    lineItemId: String(pr.line_item_id ?? pr.lineItemId ?? "")
      .trim()
      .toLowerCase(),
    lineItemNumber: Number(pr.line_item ?? pr.lineItem ?? 0) || 0,
    xanoRowId: Number(pr.id) || 0,

    clientName: master.mp_client_name,
    campaignName: master.mp_campaignname,
    campaignStatus: master.campaign_status.trim().toLowerCase(),
    campaignStartDate: master.campaign_start_date,
    campaignEndDate: master.campaign_end_date,
    brand: versionRow.brand ?? null,
    platform,
    platformLabel: deriveProgrammaticPlatformLabel({
      platform,
      campaignName: master.mp_campaignname,
      lineItemName,
    }),
    bidStrategy: String(pr.bid_strategy ?? pr.bidStrategy ?? "").trim(),
    buyType,
    creativeTargeting: String(pr.creative_targeting ?? pr.creativeTargeting ?? "").trim(),
    creative: String(pr.creative ?? "").trim(),
    buyingDemo: String(pr.buying_demo ?? pr.buyingDemo ?? "").trim(),
    market: String(pr.market ?? "").trim(),
    fixedCostMedia: !!pr.fixed_cost_media,
    clientPaysForMedia: !!pr.client_pays_for_media,
    budgetIncludesFees: !!pr.budget_includes_fees,

    channelFamily,
    snowflakeChannel,
    deliverableMetric: mapDeliverableMetric({
      channel: "programmatic",
      buyType,
      platform,
    }),
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
    cpm: null,
    cpv: null,
    vtr: null,

    kpiTargets: null,

    spendPacingDeferredToDirect: false,

    platformCampaigns: [],
  };
}

export async function resolveLiveProgrammaticPacingCampaignRows(
  args: GetLiveProgrammaticLineItemsArgs
): Promise<ProgrammaticPacingCampaignRow[]> {
  const inputs = await resolveLiveProgrammaticLineItemInputs(args);
  const rows: ProgrammaticPacingCampaignRow[] = [];

  for (const { master, versionRow, progRow, channelFamily, snowflakeChannel } of inputs) {
    rows.push(
      mapProgRowToCampaignRow(
        master,
        versionRow,
        progRow,
        args.asOfDate,
        channelFamily,
        snowflakeChannel
      )
    );
  }

  return rows;
}
