import "server-only";

import { getAsOfDate } from "@/lib/pacing/maths";
import {
  getCachedAdServingPacingRows,
  getCachedDirectPacingRows,
  getCachedProgrammaticPacingRows,
  getCachedSearchPacingRows,
  getCachedSocialPacingRows,
} from "@/lib/pacing/campaigns/pacingRowsCache";
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus";
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems";
import type { OverviewPayload } from "@/lib/pacing/overview/types";

/**
 * Portfolio Overview: UNION of the same 4h cached channel fetchers the
 * Search / Social / Programmatic / Ad Serving / Direct tabs already use.
 * Does not change pacing maths — only re-reads status bands for attention lists.
 */
export async function buildOverviewPayload(args: {
  asOfDate?: string;
  allowedClientSlugs: Set<string> | null;
}): Promise<OverviewPayload> {
  const asOfDate = args.asOfDate?.trim() || getAsOfDate();
  const allowedClientSlugs = args.allowedClientSlugs;

  const [search, social, programmatic, direct, adServing] = await Promise.all([
    getCachedSearchPacingRows(asOfDate, allowedClientSlugs),
    getCachedSocialPacingRows(asOfDate, allowedClientSlugs),
    getCachedProgrammaticPacingRows(asOfDate, allowedClientSlugs),
    getCachedDirectPacingRows(asOfDate, allowedClientSlugs, false),
    getCachedAdServingPacingRows(asOfDate, allowedClientSlugs),
  ]);

  const items = [
    ...(search ?? []).map((row) =>
      mapSpendRowToOverviewItem(
        "search",
        {
          clientName: row.clientName,
          campaignName: row.campaignName,
          mbaNumber: row.mbaNumber,
          lineItemId: row.lineItemId,
          currentBurst: row.currentBurst,
          spendToDateCurrentBurst: row.spendToDateCurrentBurst,
          spendYesterday: row.spendYesterday,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
          revenue: row.revenue,
        },
        asOfDate
      )
    ),
    ...(social ?? []).map((row) =>
      mapSpendRowToOverviewItem(
        "social",
        {
          clientName: row.clientName,
          campaignName: row.campaignName,
          mbaNumber: row.mbaNumber,
          lineItemId: row.lineItemId,
          currentBurst: row.currentBurst,
          spendToDateCurrentBurst: row.spendToDateCurrentBurst,
          spendYesterday: row.spendYesterday,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: 0,
          revenue: 0,
        },
        asOfDate
      )
    ),
    ...(programmatic ?? []).map((row) =>
      mapSpendRowToOverviewItem(
        "programmatic",
        {
          clientName: row.clientName,
          campaignName: row.campaignName,
          mbaNumber: row.mbaNumber,
          lineItemId: row.lineItemId,
          currentBurst: row.currentBurst,
          spendToDateCurrentBurst: row.spendToDateCurrentBurst,
          spendYesterday: row.spendYesterday,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: 0,
          revenue: 0,
        },
        asOfDate
      )
    ),
    ...(direct ?? []).flatMap((group) =>
      group.lineItems.map((line) =>
        mapDirectLineToOverviewItem({
          clientName: group.clientName,
          campaignName: group.campaignName,
          mbaNumber: group.mbaNumber,
          lineItemId: line.lineItemId,
          lineItemName: line.lineItemName,
          lineItemStatus: line.lineItemStatus,
          burstStatuses: line.bursts.map((b) => b.status),
          bookedCost: line.totalBudget,
          spentCost: line.totalActual,
        })
      )
    ),
    ...(adServing ?? []).map((row) =>
      mapAdServingRowToOverviewItem({
        clientName: row.clientName,
        campaignName: row.campaignName,
        mbaNumber: row.mbaNumber,
        lineItemId: row.lineItemId,
        lineItemLabel: row.creative || row.lineItemId,
        lineItemStatus: row.lineItemStatus,
      })
    ),
  ];

  let kpiPending = 0;
  for (const row of search ?? []) {
    if (computeRowKpiStatus(row) === "kpi-pending") kpiPending += 1;
  }

  const summarized = summarizeOverviewItems(items, kpiPending);
  return { ...summarized, asOfDate };
}
