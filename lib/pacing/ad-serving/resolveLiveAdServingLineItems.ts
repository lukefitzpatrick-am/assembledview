import "server-only";

import { findCurrentBurstIndex } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import { type VersionRow } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import {
  fetchXanoLineItemsForMba,
  resolveLivePlanLineItems,
} from "@/lib/pacing/plans/resolveLivePlanLineItems";
import type {
  AdServingChannelFamily,
  AdServingPacingCampaignRow,
} from "@/lib/pacing/ad-serving/types";
import { type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

export type GetLiveAdServingLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type LiveAdServingLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  digitalRow: Record<string, unknown>;
  channelFamily: AdServingChannelFamily;
};

type DigitalTableSpec = {
  tableName: string;
  channelFamily: AdServingChannelFamily;
};

/** CM360-scope digital channels — same set as dashboard Ad Serving block. */
const DIGITAL_TABLES: DigitalTableSpec[] = [
  { tableName: "media_plan_digi_display", channelFamily: "digitalDisplay" },
  { tableName: "media_plan_digi_video", channelFamily: "digitalVideo" },
  { tableName: "media_plan_digi_audio", channelFamily: "digitalAudio" },
  { tableName: "media_plan_digi_bvod", channelFamily: "bvod" },
];

export async function fetchDigitalLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
  tableName: string;
}): Promise<Record<string, unknown>[]> {
  return fetchXanoLineItemsForMba(args);
}

/** Plan deliverable totals by buy type — mirrors directDigitalAdapterShared.bookedDeliverables. */
export function bookedDeliverablesFromRow(row: Record<string, unknown>): {
  impressions: number;
  clicks: number;
} {
  const buy = String(row.buy_type ?? row.buyType ?? "")
    .trim()
    .toLowerCase();
  const bursts = parseBurstsToNormalised(row.bursts_json ?? row.bursts);
  const total = bursts.reduce((sum, b) => sum + (b.calculatedValue > 0 ? b.calculatedValue : 0), 0);
  if (buy === "cpc" || buy === "cpa" || buy === "cpl") {
    return { impressions: 0, clicks: total };
  }
  return { impressions: total, clicks: 0 };
}

export async function resolveLiveAdServingLineItemInputs(
  args: GetLiveAdServingLineItemsArgs
): Promise<LiveAdServingLineItemInput[]> {
  const specByEndpoint = new Map(DIGITAL_TABLES.map((spec) => [spec.tableName, spec]));
  const rows = await resolveLivePlanLineItems({
    endpoints: DIGITAL_TABLES.map((spec) => spec.tableName),
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    channelLabel: "ad-serving",
  });

  const inputs: LiveAdServingLineItemInput[] = [];
  for (const row of rows) {
    const spec = specByEndpoint.get(row.endpoint);
    if (!spec) continue;
    inputs.push({
      master: row.master,
      versionRow: row.versionRow,
      digitalRow: row.lineItem,
      channelFamily: spec.channelFamily,
    });
  }
  return inputs;
}

function mapDigitalRowToCampaignRow(
  master: MediaPlanMaster,
  versionRow: VersionRow,
  dr: Record<string, unknown>,
  asOfDate: string,
  channelFamily: AdServingChannelFamily
): AdServingPacingCampaignRow {
  const bursts = parseBurstsToNormalised(dr.bursts_json ?? dr.bursts);
  const lineItemStartDate = bursts.length > 0 ? bursts[0]!.startDate : null;
  const lineItemEndDate = bursts.length > 0 ? bursts[bursts.length - 1]!.endDate : null;
  const currentBurstIndex = findCurrentBurstIndex(bursts, asOfDate);
  const currentBurst = currentBurstIndex !== null ? bursts[currentBurstIndex]! : null;
  const booked = bookedDeliverablesFromRow(dr);

  const deliverableKind: AdServingPacingCampaignRow["deliverableKind"] =
    booked.impressions > 0 ? "impressions" : booked.clicks > 0 ? "clicks" : null;
  const deliverableTarget =
    deliverableKind === "impressions"
      ? booked.impressions
      : deliverableKind === "clicks"
        ? booked.clicks
        : 0;

  return {
    mbaNumber: master.mba_number,
    mediaPlanVersionId: versionRow.id,
    mediaPlanVersionNumber: master.version_number,
    lineItemId: String(dr.line_item_id ?? dr.lineItemId ?? "")
      .trim()
      .toLowerCase(),
    lineItemNumber: Number(dr.line_item ?? dr.lineItem ?? 0) || 0,
    xanoRowId: Number(dr.id) || 0,

    clientName: master.mp_client_name,
    campaignName: master.mp_campaignname,
    campaignStatus: master.campaign_status.trim().toLowerCase(),
    campaignStartDate: master.campaign_start_date,
    campaignEndDate: master.campaign_end_date,
    brand: versionRow.brand ?? null,
    platform: String(dr.platform ?? "").trim(),
    bidStrategy: String(dr.bid_strategy ?? dr.bidStrategy ?? "").trim(),
    buyType: String(dr.buy_type ?? dr.buyType ?? "").trim(),
    creativeTargeting: String(dr.creative_targeting ?? dr.creativeTargeting ?? "").trim(),
    creative: String(dr.creative ?? "").trim(),
    buyingDemo: String(dr.buying_demo ?? dr.buyingDemo ?? "").trim(),
    market: String(dr.market ?? "").trim(),

    channelFamily,

    lineItemStartDate,
    lineItemEndDate,
    totalBursts: bursts.length,
    bursts,
    currentBurstIndex,
    currentBurst,

    lineItemStatus: "no-data",

    plannedImpressions: booked.impressions,
    plannedClicks: booked.clicks,

    impressions: 0,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 0,

    deliverableProgress: null,
    deliverableActual: 0,
    deliverableTarget,
    deliverableKind,
  };
}

export async function resolveLiveAdServingPacingCampaignRows(
  args: GetLiveAdServingLineItemsArgs
): Promise<AdServingPacingCampaignRow[]> {
  const inputs = await resolveLiveAdServingLineItemInputs(args);
  return inputs.map(({ master, versionRow, digitalRow, channelFamily }) =>
    mapDigitalRowToCampaignRow(master, versionRow, digitalRow, args.asOfDate, channelFamily)
  );
}
