import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types";
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus";
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems";
import type { OverviewStatusCounts } from "@/lib/pacing/overview/types";
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";

export function countSearchOverviewStatus(
  rows: SearchPacingCampaignRow[],
  asOfDate: string
): OverviewStatusCounts {
  const items = rows.map((row) =>
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
  );
  let kpiPending = 0;
  for (const row of rows) {
    if (computeRowKpiStatus(row) === "kpi-pending") kpiPending += 1;
  }
  return summarizeOverviewItems(items, kpiPending).counts;
}

export function countSocialOverviewStatus(
  rows: SocialPacingCampaignRow[],
  asOfDate: string
): OverviewStatusCounts {
  const items = rows.map((row) =>
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
  );
  return summarizeOverviewItems(items, 0).counts;
}

export function countProgrammaticOverviewStatus(
  rows: ProgrammaticPacingCampaignRow[],
  asOfDate: string
): OverviewStatusCounts {
  const items = rows.map((row) =>
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
  );
  return summarizeOverviewItems(items, 0).counts;
}

export function countDirectOverviewStatus(
  groups: DirectCampaignGroup[]
): OverviewStatusCounts {
  const items = groups.flatMap((group) =>
    group.lineItems.map((line) =>
      mapDirectLineToOverviewItem({
        clientName: group.clientName,
        campaignName: group.campaignName,
        mbaNumber: group.mbaNumber,
        lineItemId: line.lineItemId,
        lineItemName: line.lineItemName,
        lineItemStatus: line.lineItemStatus,
        burstStatuses: line.bursts.map((burst) => burst.status),
        bookedCost: line.totalBudget,
        spentCost: line.totalActual,
      })
    )
  );
  return summarizeOverviewItems(items, 0).counts;
}

export function countAdServingOverviewStatus(
  rows: AdServingPacingCampaignRow[]
): OverviewStatusCounts {
  const items = rows.map((row) =>
    mapAdServingRowToOverviewItem({
      clientName: row.clientName,
      campaignName: row.campaignName,
      mbaNumber: row.mbaNumber,
      lineItemId: row.lineItemId,
      lineItemLabel: row.creative || row.lineItemId,
      lineItemStatus: row.lineItemStatus,
    })
  );
  return summarizeOverviewItems(items, 0).counts;
}
