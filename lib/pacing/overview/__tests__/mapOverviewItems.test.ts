import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  overviewStatusFromPacing,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems";

test("overviewStatusFromPacing splits slightly_over from over_pacing", () => {
  assert.equal(overviewStatusFromPacing("slightly_over"), "ahead");
  assert.equal(overviewStatusFromPacing("over_pacing"), "over-pacing");
  assert.equal(overviewStatusFromPacing("under_pacing"), "behind");
  assert.equal(overviewStatusFromPacing("on_track"), "on-track");
});

test("mapSpendRowToOverviewItem flags over-pacing when burn is extreme", () => {
  // Mid-flight: half the window elapsed, nearly full budget spent → over_pacing.
  const item = mapSpendRowToOverviewItem(
    "search",
    {
      clientName: "Krusty",
      campaignName: "krusty002",
      mbaNumber: "krusty002",
      lineItemId: "krusty002SE1",
      currentBurst: {
        budget: 10_000,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
      spendToDateCurrentBurst: 9_500,
      spendYesterday: 500,
      impressions: 1000,
      clicks: 50,
      conversions: 1,
      revenue: 0,
    },
    "2026-01-16"
  );
  assert.equal(item.status, "over-pacing");
  assert.equal(item.channel, "search");
});

test("mapSpendRowToOverviewItem stays ahead (not warning) for mild over", () => {
  // Slightly over projection but under the 15% over_pacing threshold.
  const item = mapSpendRowToOverviewItem(
    "social",
    {
      clientName: "Krusty",
      campaignName: "krusty002",
      mbaNumber: "krusty002",
      lineItemId: "krusty002SO1",
      currentBurst: {
        budget: 10_000,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
      // ~55% of time elapsed (~16/31) with ~60% spend → slightly_over-ish
      spendToDateCurrentBurst: 5_800,
      spendYesterday: 200,
      impressions: 1000,
      clicks: 40,
    },
    "2026-01-16"
  );
  // projectionVariancePct ≈ 12.4% → slightly_over → ahead (not over-pacing burn)
  assert.equal(item.status, "ahead");
});

test("direct Radio/OOH-style lines map into overview bands", () => {
  const under = mapDirectLineToOverviewItem({
    clientName: "Krusty",
    campaignName: "krusty002",
    mbaNumber: "krusty002",
    lineItemId: "krusty002RD1",
    lineItemName: "Radio metro",
    lineItemStatus: "completed_under",
    bookedCost: 50_000,
    spentCost: 40_000,
  });
  assert.equal(under.status, "behind");
  assert.equal(under.channel, "direct");

  const mixed = mapDirectLineToOverviewItem({
    clientName: "Krusty",
    campaignName: "krusty002",
    mbaNumber: "krusty002",
    lineItemId: "krusty002OH1",
    lineItemName: "OOH panels",
    lineItemStatus: "mixed",
    burstStatuses: ["completed_over", "in_progress"],
    bookedCost: 20_000,
    spentCost: 12_000,
  });
  assert.equal(mixed.status, "ahead");
});

test("ad serving is delivery-only (never spend over-pacing)", () => {
  const serving = mapAdServingRowToOverviewItem({
    clientName: "Krusty",
    campaignName: "krusty002",
    mbaNumber: "krusty002",
    lineItemId: "krusty002AS1",
    lineItemStatus: "serving",
  });
  assert.equal(serving.status, "on-track");
  assert.equal(serving.budget, null);
});

test("summarizeOverviewItems builds separate underperforming and over-pacing lists", () => {
  const payload = summarizeOverviewItems([
    {
      id: "1",
      channel: "search",
      clientName: "A",
      campaignName: "c",
      mbaNumber: "m1",
      lineItemLabel: "a",
      status: "behind",
      budget: 100,
      spendToDate: 20,
      href: "/pacing/search",
    },
    {
      id: "2",
      channel: "social",
      clientName: "A",
      campaignName: "c",
      mbaNumber: "m1",
      lineItemLabel: "b",
      status: "over-pacing",
      budget: 100,
      spendToDate: 95,
      href: "/pacing/social",
    },
    {
      id: "3",
      channel: "direct",
      clientName: "A",
      campaignName: "c",
      mbaNumber: "m1",
      lineItemLabel: "c",
      status: "ahead",
      budget: 50,
      spendToDate: 55,
      href: "/pacing/direct",
    },
  ]);

  assert.equal(payload.counts.behind, 1);
  assert.equal(payload.counts.overPacing, 1);
  assert.equal(payload.counts.ahead, 1);
  assert.equal(payload.underperforming.length, 1);
  assert.equal(payload.overPacing.length, 1);
  assert.equal(payload.aheadOnDelivery.length, 1);
  assert.equal(payload.overPacing[0]!.id, "2");
});
