import "server-only";

import type { DateWindows } from "@/lib/pacing/campaigns/aggregate";
import type { KpiTargets } from "@/lib/pacing/campaigns/types";
import { fetchCampaignKpisForMbas } from "@/lib/xano/campaignKpi";
import {
  aggregateSocialForLineItem,
  type SocialFactRow,
} from "@/lib/pacing/social/aggregate";
import {
  resolveLiveSocialPacingCampaignRows,
  type GetLiveSocialLineItemsArgs,
} from "@/lib/pacing/social/resolveLiveSocialLineItems";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";
import {
  computePacing,
  getMelbourneYesterdayISO,
  type PacingStatus,
} from "@/lib/pacing/maths";
import { queryPacingFact } from "@/lib/snowflake/pacing-fact";

export type FetchSocialPacingCampaignRowsArgs = GetLiveSocialLineItemsArgs;

function aggregateSocialSpendWindows(
  rows: SocialFactRow[],
  windows: DateWindows
): { spendToDateLineTotal: number; spendToDateCurrentBurst: number; spendYesterday: number } {
  let spendToDateLineTotal = 0;
  let spendToDateCurrentBurst = 0;
  let spendYesterday = 0;

  for (const row of rows) {
    const d = row.DATE_DAY;
    const spent = row.AMOUNT_SPENT ?? 0;
    if (d >= windows.lineTotalStart && d <= windows.lineTotalEnd) {
      spendToDateLineTotal += spent;
    }
    if (
      windows.currentBurstStart &&
      windows.currentBurstEnd &&
      d >= windows.currentBurstStart &&
      d <= windows.currentBurstEnd
    ) {
      spendToDateCurrentBurst += spent;
    }
    if (d === windows.yesterday) {
      spendYesterday += spent;
    }
  }

  return { spendToDateLineTotal, spendToDateCurrentBurst, spendYesterday };
}

/** Maps 7-state computePacing output to the 4-state campaigns table pill. */
function lineItemStatusFromPacing(
  status: PacingStatus
): SocialPacingCampaignRow["lineItemStatus"] {
  if (status === "on_track" || status === "completed") return "on-track";
  if (status === "not_started") return "no-data";
  if (status === "slightly_under" || status === "under_pacing" || status === "no_delivery") {
    return "behind";
  }
  if (status === "slightly_over" || status === "over_pacing") return "ahead";
  return "no-data";
}

async function fetchFactsForPlatform(
  socialPlatform: SocialFactRow["socialPlatform"],
  lineItemIds: string[],
  startDate: string,
  endDate: string
): Promise<SocialFactRow[]> {
  if (lineItemIds.length === 0) return [];

  try {
    const rows = await queryPacingFact({
      channel: socialPlatform,
      lineItemIds,
      startDate,
      endDate,
    });
    return rows.map((row) => ({ ...row, socialPlatform }));
  } catch (err) {
    console.error(
      `[fetchSocialPacingCampaignRows] Snowflake query failed for ${socialPlatform}`,
      { lineItemCount: lineItemIds.length, startDate, endDate, err }
    );
    return [];
  }
}

/**
 * Full social pacing composer: resolves live line items, hydrates Snowflake
 * actuals per platform, aggregates to line-item grain, and computes spend pacing.
 */
export async function fetchSocialPacingCampaignRows(
  args: FetchSocialPacingCampaignRowsArgs
): Promise<SocialPacingCampaignRow[]> {
  const rows = await resolveLiveSocialPacingCampaignRows(args);
  if (rows.length === 0) return rows;

  const metaIds = Array.from(
    new Set(
      rows.filter((r) => r.socialPlatform === "meta").map((r) => r.lineItemId.toLowerCase())
    )
  );
  const tiktokIds = Array.from(
    new Set(
      rows.filter((r) => r.socialPlatform === "tiktok").map((r) => r.lineItemId.toLowerCase())
    )
  );

  const lineTotalStart =
    rows
      .map((r) => r.lineItemStartDate)
      .filter((d): d is string => !!d)
      .sort()[0] ?? args.asOfDate;
  const yesterday = getMelbourneYesterdayISO(args.asOfDate);

  if (metaIds.length > 0 || tiktokIds.length > 0) {
    const [metaFacts, tiktokFacts] = await Promise.all([
      fetchFactsForPlatform("meta", metaIds, lineTotalStart, args.asOfDate),
      fetchFactsForPlatform("tiktok", tiktokIds, lineTotalStart, args.asOfDate),
    ]);
    const allFacts = [...metaFacts, ...tiktokFacts];

    const byLineItem = new Map<string, SocialFactRow[]>();
    for (const fact of allFacts) {
      const k = String(fact.LINE_ITEM_ID ?? "")
        .trim()
        .toLowerCase();
      if (!k) continue;
      let bucket = byLineItem.get(k);
      if (!bucket) {
        bucket = [];
        byLineItem.set(k, bucket);
      }
      bucket.push(fact);
    }

    for (const row of rows) {
      const matched = byLineItem.get(row.lineItemId.toLowerCase()) ?? [];
      const windows: DateWindows = {
        lineTotalStart: row.lineItemStartDate ?? lineTotalStart,
        lineTotalEnd: args.asOfDate,
        currentBurstStart: row.currentBurst?.startDate ?? null,
        currentBurstEnd: row.currentBurst?.endDate ?? null,
        yesterday,
      };

      const { metrics, deliverableActual, campaigns } = aggregateSocialForLineItem(
        matched,
        windows,
        row.deliverableMetric
      );
      const spendWindows = aggregateSocialSpendWindows(matched, windows);

      row.spendToDateLineTotal = spendWindows.spendToDateLineTotal;
      row.spendToDateCurrentBurst = spendWindows.spendToDateCurrentBurst;
      row.spendYesterday = spendWindows.spendYesterday;

      row.spend = metrics.spend;
      row.impressions = metrics.impressions;
      row.clicks = metrics.clicks;
      row.results = metrics.results;
      row.videoViews = metrics.videoViews;
      row.deliverableActual = deliverableActual;
      row.ctr = metrics.ctr;
      row.conversionRate = metrics.conversionRate;
      row.cpv = metrics.cpv;
      row.vtr = metrics.vtr;
      row.platformCampaigns = campaigns;

      row.spendRemainingCurrentBurst =
        row.currentBurst !== null
          ? row.currentBurst.budget - spendWindows.spendToDateCurrentBurst
          : null;
      row.spendRemainingLineTotal = row.totalLineItemBudget - spendWindows.spendToDateLineTotal;
      row.spendPerDayRemaining =
        row.spendRemainingCurrentBurst !== null &&
        row.burstDaysRemaining !== null &&
        row.burstDaysRemaining > 0
          ? row.spendRemainingCurrentBurst / row.burstDaysRemaining
          : null;

      if (row.currentBurst === null) {
        row.lineItemStatus = "no-data";
      } else {
        const mathsOutput = computePacing({
          lineItemBudget: row.currentBurst.budget,
          startDate: row.currentBurst.startDate,
          endDate: row.currentBurst.endDate,
          spendToDate: spendWindows.spendToDateCurrentBurst,
          spendYesterday: spendWindows.spendYesterday,
          impressionsToDate: metrics.impressions,
          clicksToDate: metrics.clicks,
          conversionsToDate: 0,
          revenueToDate: 0,
          asOfDate: args.asOfDate,
        });
        row.lineItemStatus = lineItemStatusFromPacing(mathsOutput.status);
      }
    }
  }

  // --- KPI targets (mirrors fetchSearchPacingCampaignRows) ---
  const mbaVersionPairs = rows.map((r) => ({
    mbaNumber: r.mbaNumber,
    versionNumber: r.mediaPlanVersionNumber,
  }));
  const campaignKpiRows = await fetchCampaignKpisForMbas({ mbaVersionPairs });

  const kpiTargetsByKey = new Map<string, KpiTargets>();

  function makeKpiKey(mba: string, version: number, lineItemId: string): string {
    return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
  }

  for (const ck of campaignKpiRows) {
    const key = makeKpiKey(ck.mba_number, ck.version_number, ck.line_item_id);
    if (kpiTargetsByKey.has(key)) {
      console.warn(`[fetchSocialPacingCampaignRows] duplicate campaign_kpi for ${key}`);
    }
    kpiTargetsByKey.set(key, {
      mediaType: ck.media_type ?? null,
      publisher: ck.publisher ?? null,
      bidStrategy: ck.bid_strategy ?? null,
      ctr: ck.ctr,
      cpv: ck.cpv,
      conversionRate: ck.conversion_rate,
      vtr: ck.vtr,
      frequency: ck.frequency,
    });
  }

  for (const row of rows) {
    const key = makeKpiKey(row.mbaNumber, row.mediaPlanVersionNumber, row.lineItemId);
    row.kpiTargets = kpiTargetsByKey.get(key) ?? null;
  }

  return rows;
}
