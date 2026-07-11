import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import {
  fetchAllMasters,
  fetchCurrentVersionRowsForMasters,
  type VersionRow,
} from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric";
import type {
  ProgrammaticChannelFamily,
  ProgrammaticPacingCampaignRow,
  ProgrammaticSnowflakeChannel,
} from "@/lib/pacing/programmatic/types";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type GetLiveProgrammaticLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
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
    snowflakeChannel: "programmatic-display",
  },
  {
    tableName: "media_plan_prog_video",
    channelFamily: "progVideo",
    snowflakeChannel: "programmatic-video",
  },
  {
    tableName: "media_plan_prog_bvod",
    channelFamily: "progBvod",
    snowflakeChannel: "programmatic-video",
  },
  {
    tableName: "media_plan_prog_audio",
    channelFamily: "progAudio",
    snowflakeChannel: "programmatic-video",
  },
  {
    tableName: "media_plan_prog_ooh",
    channelFamily: "progOoh",
    snowflakeChannel: "programmatic-display",
  },
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

export async function fetchProgrammaticLineItemsForMba(args: {
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
  const inputs: LiveProgrammaticLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/programmatic] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    for (const spec of PROG_TABLES) {
      const progRows = await fetchProgrammaticLineItemsForMba({
        mba_number: master.mba_number,
        versionRowId: versionRow.id,
        versionNumber: master.version_number,
        tableName: spec.tableName,
      });

      for (const progRow of progRows) {
        const lineItemId = String(progRow.line_item_id ?? progRow.lineItemId ?? "").trim();
        if (!lineItemId) {
          console.warn(
            "[pacing/programmatic] row missing line_item_id",
            master.mba_number,
            spec.tableName,
            progRow.id
          );
          continue;
        }
        inputs.push({
          master,
          versionRow,
          progRow,
          channelFamily: spec.channelFamily,
          snowflakeChannel: spec.snowflakeChannel,
        });
      }
    }
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
