import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types";
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types";
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus";
import {
  countAdServingOverviewStatus,
  countDirectOverviewStatus,
  countProgrammaticOverviewStatus,
  countSearchOverviewStatus,
  countSocialOverviewStatus,
} from "@/lib/pacing/overview/countChannelOverviewStatus";
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems";
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";

const asOfDate = "2026-01-16";
const burst = {
  index: 0,
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  budget: 10_000,
  buyAmount: 0,
  calculatedValue: 0,
};

function searchRow(
  lineItemId: string,
  spendToDateCurrentBurst: number,
  kpiTargets: SearchPacingCampaignRow["kpiTargets"]
): SearchPacingCampaignRow {
  return {
    clientName: "Krusty",
    campaignName: "January",
    mbaNumber: "krusty001",
    lineItemId,
    currentBurst: burst,
    spendToDateCurrentBurst,
    spendYesterday: 100,
    impressions: 1_000,
    clicks: 50,
    conversions: 2,
    revenue: 0,
    ctr: 0.05,
    kpiTargets,
  } as SearchPacingCampaignRow;
}

function expectedSpendCounts(
  channel: "social" | "programmatic",
  rows: Array<SocialPacingCampaignRow | ProgrammaticPacingCampaignRow>
) {
  const items = rows.map((row) =>
    mapSpendRowToOverviewItem(
      channel,
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

test("search counter ≡ mapper+summarize on fixed rows", () => {
  const targets = {
    mediaType: "search",
    publisher: null,
    bidStrategy: null,
    ctr: 4,
    cpv: null,
    conversionRate: null,
    vtr: null,
    frequency: null,
  };
  const rows = [
    searchRow("over", 9_500, targets),
    searchRow("behind", 1_000, targets),
    searchRow("pending", 5_000, null),
  ];
  const expectedItems = rows.map((row) =>
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

  const expected = summarizeOverviewItems(expectedItems, kpiPending).counts;
  assert.deepEqual(countSearchOverviewStatus(rows, asOfDate), expected);
});

test("social counter ≡ zero-conversion mapper+summarize on fixed rows", () => {
  const rows = [
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "ahead",
      currentBurst: burst,
      spendToDateCurrentBurst: 5_800,
      spendYesterday: 100,
      impressions: 1_000,
      clicks: 40,
    },
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "no-data",
      currentBurst: null,
      spendToDateCurrentBurst: 0,
      spendYesterday: 0,
      impressions: 0,
      clicks: 0,
    },
  ] as SocialPacingCampaignRow[];

  assert.deepEqual(
    countSocialOverviewStatus(rows, asOfDate),
    expectedSpendCounts("social", rows)
  );
});

test("programmatic counter ≡ zero-conversion mapper+summarize on fixed rows", () => {
  const rows = [
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "over",
      currentBurst: burst,
      spendToDateCurrentBurst: 9_500,
      spendYesterday: 100,
      impressions: 1_000,
      clicks: 40,
    },
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "behind",
      currentBurst: burst,
      spendToDateCurrentBurst: 1_000,
      spendYesterday: 100,
      impressions: 1_000,
      clicks: 40,
    },
  ] as ProgrammaticPacingCampaignRow[];

  assert.deepEqual(
    countProgrammaticOverviewStatus(rows, asOfDate),
    expectedSpendCounts("programmatic", rows)
  );
});

test("direct counter ≡ flattened line mapper+summarize with burst statuses", () => {
  const groups = [
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItems: [
        {
          lineItemId: "under",
          lineItemName: "Radio",
          lineItemStatus: "completed_under",
          totalBudget: 10_000,
          totalActual: 8_000,
          bursts: [],
        },
        {
          lineItemId: "mixed",
          lineItemName: "OOH",
          lineItemStatus: "mixed",
          totalBudget: 10_000,
          totalActual: 11_000,
          bursts: [{ status: "completed_over" }],
        },
      ],
    },
  ] as DirectCampaignGroup[];
  const expectedItems = groups.flatMap((group) =>
    group.lineItems.map((line) =>
      mapDirectLineToOverviewItem({
        clientName: group.clientName,
        campaignName: group.campaignName,
        mbaNumber: group.mbaNumber,
        lineItemId: line.lineItemId,
        lineItemName: line.lineItemName,
        lineItemStatus: line.lineItemStatus,
        burstStatuses: line.bursts.map((item) => item.status),
        bookedCost: line.totalBudget,
        spentCost: line.totalActual,
      })
    )
  );

  assert.deepEqual(
    countDirectOverviewStatus(groups),
    summarizeOverviewItems(expectedItems, 0).counts
  );
});

test("ad-serving counter ≡ delivery mapper+summarize on fixed rows", () => {
  const rows = [
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "serving",
      creative: "Creative A",
      lineItemStatus: "serving",
    },
    {
      clientName: "Krusty",
      campaignName: "January",
      mbaNumber: "krusty001",
      lineItemId: "missing",
      creative: "",
      lineItemStatus: "no-data",
    },
  ] as AdServingPacingCampaignRow[];
  const expectedItems = rows.map((row) =>
    mapAdServingRowToOverviewItem({
      clientName: row.clientName,
      campaignName: row.campaignName,
      mbaNumber: row.mbaNumber,
      lineItemId: row.lineItemId,
      lineItemLabel: row.creative || row.lineItemId,
      lineItemStatus: row.lineItemStatus,
    })
  );

  assert.deepEqual(
    countAdServingOverviewStatus(rows),
    summarizeOverviewItems(expectedItems, 0).counts
  );
});
