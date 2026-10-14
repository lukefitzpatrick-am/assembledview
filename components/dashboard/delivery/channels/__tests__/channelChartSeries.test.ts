import assert from "node:assert/strict"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "@/components/dashboard/delivery/channels/directDigitalAdapterShared"
import { buildProgrammaticDisplaySection } from "@/components/dashboard/delivery/channels/programmaticDisplayAdapter"
import { buildProgrammaticVideoSection } from "@/components/dashboard/delivery/channels/programmaticVideoAdapter"
import { buildSearchSection } from "@/components/dashboard/delivery/channels/searchAdapter"
import { buildSocialMetaSection } from "@/components/dashboard/delivery/channels/socialMetaAdapter"
import {
  DIRECT_DIGITAL_CLICKS_SERIES,
  DIRECT_DIGITAL_COMPLETION_SERIES,
  DIRECT_DIGITAL_IMPRESSIONS_SERIES,
  PROGRAMMATIC_CHART_SERIES,
  PROGRAMMATIC_CPV_CHART_SERIES,
  SEARCH_CHART_SERIES,
  SOCIAL_CHART_SERIES,
} from "@/components/dashboard/delivery/channels/channelChartSeries"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const WINDOW = {
  asAtISO: "2026-07-03",
  campaignStartISO: "2026-07-01",
  campaignEndISO: "2026-07-31",
}

test("channel chart series match the dashboard adapters", () => {
  assert.deepEqual(SOCIAL_CHART_SERIES, [
    { key: "amount_spent", label: "Spend", yAxis: "left" },
    { key: "impressions", label: "Impressions", yAxis: "right" },
  ])
  assert.deepEqual(SEARCH_CHART_SERIES, [
    { key: "cost", label: "Cost", yAxis: "left" },
    { key: "clicks", label: "Clicks", yAxis: "right" },
  ])
  assert.deepEqual(PROGRAMMATIC_CHART_SERIES, [
    { key: "amount_spent", label: "Spend", yAxis: "left" },
    { key: "impressions", label: "Impressions", yAxis: "right" },
  ])
  assert.deepEqual(PROGRAMMATIC_CPV_CHART_SERIES, [
    { key: "amount_spent", label: "Spend", yAxis: "left" },
    { key: "video_3s_views", label: "Views", yAxis: "right" },
  ])
  assert.deepEqual(DIRECT_DIGITAL_IMPRESSIONS_SERIES, {
    key: "impressions",
    label: "Impressions",
    yAxis: "left",
    format: "number",
  })
  assert.deepEqual(DIRECT_DIGITAL_CLICKS_SERIES, {
    key: "clicks",
    label: "Clicks",
    yAxis: "right",
    format: "number",
  })
  assert.deepEqual(DIRECT_DIGITAL_COMPLETION_SERIES, {
    key: "completionRate",
    label: "Completion rate",
    yAxis: "right",
    format: "percent",
  })

  const social = buildSocialMetaSection({
    lineItems: [],
    snowflakeRows: [],
    campaignStart: "2026-07-01",
    campaignEnd: "2026-07-31",
    mbaNumber: "mba",
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    filterRange: { start: null, end: null },
    lastSyncedAt: null,
  })
  assert.equal(social.aggregate.chart.series, SOCIAL_CHART_SERIES)

  const search = buildSearchSection({
    searchLineItems: [],
    searchData: {
      totals: { cost: 0, clicks: 0, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null },
      daily: [],
      lineItems: [],
      keywords: [],
    },
    campaignStart: "2026-07-01",
    campaignEnd: "2026-07-31",
    filterRange: { start: null, end: null },
    kpiTargets: undefined,
    mbaNumber: "mba",
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    pacingWindow: WINDOW,
    lastSyncedAt: null,
  })
  assert.ok(search)
  assert.equal(search.aggregate.chart.series, SEARCH_CHART_SERIES)

  const line = {
    line_item_id: "pd1",
    platform: "dv360",
    buy_type: "cpm",
    bursts: [{ start_date: "2026-07-01", end_date: "2026-07-31", budget_number: 100, calculated_value_number: 1000 }],
  }
  const display = buildProgrammaticDisplaySection({
    progDisplayLineItems: [line],
    combinedRows: [],
    campaignStart: "2026-07-01",
    campaignEnd: "2026-07-31",
    mbaNumber: "mba",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    pacingWindow: WINDOW,
    lastSyncedAt: null,
  })
  assert.ok(display)
  assert.equal(display.aggregate.chart.series, PROGRAMMATIC_CHART_SERIES)

  const video = buildProgrammaticVideoSection({
    progVideoLineItems: [{ ...line, line_item_id: "pv1", buy_type: "cpv" }],
    combinedRows: [],
    campaignStart: "2026-07-01",
    campaignEnd: "2026-07-31",
    mbaNumber: "mba",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    pacingWindow: WINDOW,
    lastSyncedAt: null,
  })
  assert.ok(video)
  assert.equal(video.aggregate.chart.series, PROGRAMMATIC_CPV_CHART_SERIES)

  const row: PacingRow = {
    channel: "ad-serving",
    dateDay: "2026-07-01",
    adsetName: null,
    entityName: null,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: null,
    lineItemId: "dd1",
    amountSpent: 0,
    impressions: 10,
    clicks: 1,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
  const digital = buildDirectDigitalChannelSection({
    key: "digital-display",
    title: "Display",
    lineItems: [{ line_item_id: "dd1", buy_type: "cpm" }],
    combinedRows: [row],
    campaignStart: "2026-07-01",
    campaignEnd: "2026-07-31",
    mbaNumber: "mba",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
  })
  assert.ok(digital)
  assert.deepEqual(digital.aggregate.chart.series, [
    DIRECT_DIGITAL_IMPRESSIONS_SERIES,
    DIRECT_DIGITAL_CLICKS_SERIES,
  ])
})
