import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { findCurrentBurstIndex } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import {
  fetchAllMasters,
  fetchCurrentVersionRowsForMasters,
  type VersionRow,
} from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import type {
  AdServingChannelFamily,
  AdServingPacingCampaignRow,
} from "@/lib/pacing/ad-serving/types";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

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

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function filterByMbaAndVersion(
  items: unknown[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  const normalizedMba = norm(mbaNumber);
  const versionStr = String(versionNumber);
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? String(mediaPlanVersionId)
      : null;

  return items.filter((item) => {
    const row = item as Record<string, unknown>;
    if (norm(row.mba_number) !== normalizedMba) return false;

    const mpPlanNumber = row.mp_plannumber ?? row.mp_plan_number ?? row.mpPlanNumber;
    const mediaPlanVersion = row.media_plan_version;
    const mediaPlanVersionIdField = row.media_plan_version_id ?? row.media_plan_versionID;
    const versionNumberField = row.version_number;

    const hasVersionIdCandidate =
      (mediaPlanVersion !== null &&
        mediaPlanVersion !== undefined &&
        String(mediaPlanVersion).trim() !== "") ||
      (mediaPlanVersionIdField !== null &&
        mediaPlanVersionIdField !== undefined &&
        String(mediaPlanVersionIdField).trim() !== "");

    if (versionIdStr && hasVersionIdCandidate) {
      const candidates = [mediaPlanVersion, mediaPlanVersionIdField];
      return candidates.some((value) => String(value ?? "").trim() === versionIdStr);
    }

    const versionCandidates = [mpPlanNumber, versionNumberField];
    return versionCandidates.some((value) => String(value ?? "").trim() === versionStr);
  }) as Record<string, unknown>[];
}

export async function fetchDigitalLineItemsForMba(args: {
  mba_number: string;
  versionRowId: number;
  versionNumber: number;
  tableName: string;
}): Promise<Record<string, unknown>[]> {
  const url = xanoUrl(args.tableName, [...MEDIA_PLANS_KEYS]);
  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    { mba_number: args.mba_number, media_plan_version: args.versionRowId },
    { mba_number: args.mba_number, media_plan_version_id: args.versionRowId },
    { mba_number: args.mba_number, mp_plannumber: args.versionNumber },
    { mba_number: args.mba_number, version_number: args.versionNumber },
    { mba_number: args.mba_number, media_plan_version: args.versionNumber },
  ];

  let best: Record<string, unknown>[] = [];
  let bestRawCount = Number.POSITIVE_INFINITY;

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(
      url,
      params,
      `PACING_${args.tableName}`,
      200,
      20
    );
    const filtered = filterByMbaAndVersion(
      raw,
      args.mba_number,
      args.versionNumber,
      args.versionRowId
    );
    if (
      filtered.length > best.length ||
      (filtered.length === best.length && raw.length < bestRawCount)
    ) {
      best = filtered;
      bestRawCount = raw.length;
    }
    if (raw.length > 0 && raw.length === filtered.length) {
      break;
    }
  }

  return best;
}

/** Plan deliverable totals by buy type — mirrors adServingAdapter.bookedDeliverables. */
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
  const masters = await fetchAllMasters();
  const liveMasters = masters.filter((m) => {
    if (!isLiveCampaignStatus(m.campaign_status)) return false;
    if (!m.campaign_start_date || !m.campaign_end_date) return false;
    if (args.asOfDate < m.campaign_start_date || args.asOfDate > m.campaign_end_date) {
      return false;
    }
    if (args.allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(m.mp_client_name);
      if (!slug || !args.allowedClientSlugs.has(slug)) return false;
    }
    return true;
  });

  if (liveMasters.length === 0) return [];

  const versionRowsByMba = await fetchCurrentVersionRowsForMasters(liveMasters);
  const inputs: LiveAdServingLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/ad-serving] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    for (const spec of DIGITAL_TABLES) {
      const digitalRows = await fetchDigitalLineItemsForMba({
        mba_number: master.mba_number,
        versionRowId: versionRow.id,
        versionNumber: master.version_number,
        tableName: spec.tableName,
      });

      for (const digitalRow of digitalRows) {
        const lineItemId = String(
          digitalRow.line_item_id ?? digitalRow.lineItemId ?? ""
        ).trim();
        if (!lineItemId) {
          console.warn(
            "[pacing/ad-serving] row missing line_item_id",
            master.mba_number,
            spec.tableName,
            digitalRow.id
          );
          continue;
        }
        inputs.push({
          master,
          versionRow,
          digitalRow,
          channelFamily: spec.channelFamily,
        });
      }
    }
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
