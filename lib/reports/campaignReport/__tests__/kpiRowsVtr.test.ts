/**
 * REP-4: the deck KPI table fills VTR from completed views. Frequency has no
 * reach data and stays empty ("Not tracked" on the deck).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import type { CampaignKPI } from "@/lib/kpi/types"
import { buildKpiRows, videoCompletionFeed } from "../kpiRows.js"

function kpi(overrides: Partial<CampaignKPI> = {}): CampaignKPI {
  return {
    mp_client_name: "Sinch",
    mba_number: "sinch001",
    version_number: 1,
    campaign_name: "Sinch",
    media_type: "progVideo",
    publisher: "quantcast - direct",
    bid_strategy: "cpm",
    line_item_id: "sinch001pv1",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...overrides,
  }
}

function line(overrides: Partial<DeliveryLineSnapshot>): DeliveryLineSnapshot {
  return {
    lineItemId: "x",
    name: "x",
    plannedBudget: 1000,
    plannedUnits: null,
    startDate: null,
    endDate: null,
    spendToDate: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    cpm: null,
    ctr: null,
    cpc: null,
    expectedSpendToDate: null,
    noDeliveryRows: false,
    deliveryState: "reported",
    ...overrides,
  } as DeliveryLineSnapshot
}

function channel(group: string, lines: DeliveryLineSnapshot[]): DeliveryChannelGroup {
  return { group, lines, totals: {} as DeliveryChannelGroup["totals"] }
}

const sinchChannels: DeliveryChannelGroup[] = [
  channel("programmatic_display", [
    line({ lineItemId: "sinch001pd1", impressions: 1_915_231, clicks: 900 }),
  ]),
  channel("programmatic_video", [
    line({ lineItemId: "sinch001pv1", impressions: 1_697_537, video3sViews: 1_404_706 }),
    line({ lineItemId: "sinch001pv2", impressions: 863_859, video3sViews: 760_196 }),
    // A video line with no completion tracking does not dilute the rate.
    line({ lineItemId: "sinch001pv3", impressions: 500_000, video3sViews: 0 }),
    // Not reported yet: left out.
    line({ lineItemId: "sinch001pv4", impressions: 10, video3sViews: 9, deliveryState: "no_rows_yet" }),
  ]),
  // Social 3-second views are not completions.
  channel("social_meta", [line({ lineItemId: "sinch001sm1", impressions: 50_000, video3sViews: 20_000 })]),
]

test("videoCompletionFeed counts reported video lines that carry completions", () => {
  assert.deepEqual(videoCompletionFeed(sinchChannels), {
    completions: 1_404_706 + 760_196,
    impressions: 1_697_537 + 863_859,
  })
})

test("VTR row: completed views ÷ video impressions", () => {
  const feed = videoCompletionFeed(sinchChannels)
  const rows = buildKpiRows([kpi({ vtr: 0.7 })], {
    impressions: 5_000_000,
    clicks: 900,
    results: 0,
    spend: 1000,
    videoCompletions: feed.completions,
    videoImpressions: feed.impressions,
  })
  const vtr = rows.find((row) => row.metric === "vtr")
  assert.equal(vtr?.targetDisplay, "70.00%")
  // 2,164,902 ÷ 2,561,396 = 84.52%
  assert.equal(vtr?.actualDisplay, "84.52%")
  assert.equal(vtr?.omitted, false)
})

test("VTR row stays empty with no completions", () => {
  const rows = buildKpiRows([kpi({ vtr: 0.7 })], { impressions: 1000, clicks: 5, results: 0, spend: 10 })
  assert.equal(rows.find((row) => row.metric === "vtr")?.actualDisplay, null)
})

test("frequency stays not tracked (no reach data)", () => {
  const rows = buildKpiRows([kpi({ frequency: 3 })], {
    impressions: 1000,
    clicks: 5,
    results: 0,
    spend: 10,
    videoCompletions: 500,
    videoImpressions: 1000,
  })
  const frequency = rows.find((row) => row.metric === "frequency")
  assert.equal(frequency?.targetDisplay, "3")
  assert.equal(frequency?.actualDisplay, null)
})

test("CTR and conversion rate are unchanged", () => {
  const rows = buildKpiRows([kpi({ ctr: 0.004, conversion_rate: 0.02 })], {
    impressions: 10_000,
    clicks: 50,
    results: 2,
    spend: 10,
  })
  assert.equal(rows.find((row) => row.metric === "ctr")?.actualDisplay, "0.50%")
  assert.equal(rows.find((row) => row.metric === "conversion_rate")?.actualDisplay, "4.00%")
})
