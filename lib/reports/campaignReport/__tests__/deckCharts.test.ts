import assert from "node:assert/strict"
import test from "node:test"

import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { buildDeckCharts, type DeckChart } from "@/lib/reports/campaignReport/deckCharts"
import type { PacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingDailyRow, SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

const WINDOW = { startISO: "2026-07-01", endISO: "2026-07-05" }

function line(id: string, spend: number, extra: Partial<DeliveryLineSnapshot> = {}): DeliveryLineSnapshot {
  return {
    lineItemId: id,
    name: id,
    plannedBudget: 100,
    plannedUnits: null,
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    spendToDate: spend,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    cpm: null,
    ctr: null,
    cpc: null,
    noDeliveryRows: false,
    deliveryState: "reported",
    buyType: null,
    ...extra,
  }
}

function channel(
  group: string,
  lines: DeliveryLineSnapshot[],
  spend = lines.reduce((sum, item) => sum + item.spendToDate, 0),
): DeliveryChannelGroup {
  return {
    group,
    lines,
    totals: {
      spendToDate: spend,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      plannedBudget: 100,
      cpm: null,
      ctr: null,
      cpc: null,
    },
  }
}

function pacing(partial: Partial<PacingRow> & Pick<PacingRow, "lineItemId" | "dateDay">): PacingRow {
  return {
    channel: "meta",
    adsetName: null,
    entityName: null,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: null,
    amountSpent: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    ...partial,
  }
}

function searchResponse(
  lineItemId: string,
  daily: SearchPacingDailyRow[],
): SearchPacingResponse {
  const cost = daily.reduce((sum, day) => sum + day.cost, 0)
  const clicks = daily.reduce((sum, day) => sum + day.clicks, 0)
  return {
    totals: { cost, clicks, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null },
    daily,
    lineItems: [
      {
        lineItemId,
        lineItemName: lineItemId,
        totals: { cost, clicks, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null },
        daily,
      },
    ],
    keywords: [],
  }
}

function chartFor(charts: DeckChart[], group: string): DeckChart {
  const chart = charts.find((item) => item.group === group)
  assert.ok(chart, `missing chart ${group}`)
  return chart
}

function sumLeft(chart: DeckChart): number {
  return chart.points.reduce((sum, point) => sum + point[1], 0)
}

test("social channel fills the gap day and keeps spend and impressions", () => {
  const charts = buildDeckCharts(
    {
      channels: [channel("social_meta", [line("meta1", 15.5)])],
      dailyPacingRows: [
        pacing({ lineItemId: "META1", dateDay: "2026-07-01", amountSpent: 10.25, impressions: 100, clicks: 4 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-07-03", amountSpent: 5.25, impressions: 40, clicks: 1 }),
      ],
    },
    WINDOW,
  )
  const social = chartFor(charts, "social_meta")
  assert.equal(social.scope, "channel")
  assert.equal(social.left.key, "amount_spent")
  assert.equal(social.left.format, "money")
  assert.equal(social.right?.key, "impressions")
  assert.equal(social.right?.format, "count")
  assert.deepEqual(social.points, [
    ["2026-07-01", 10.25, 100],
    ["2026-07-02", 0, 0],
    ["2026-07-03", 5.25, 40],
  ])
})

test("search channel uses dailySearch cost and clicks", () => {
  const charts = buildDeckCharts(
    {
      channels: [channel("search", [line("se1", 8.5)])],
      dailySearch: searchResponse("se1", [
        { date: "2026-07-01", cost: 3.25, clicks: 2, conversions: 0, revenue: 0, impressions: 10, topImpressionPct: null },
        { date: "2026-07-03", cost: 5.25, clicks: 4, conversions: 0, revenue: 0, impressions: 12, topImpressionPct: null },
      ]),
    },
    WINDOW,
  )
  const search = chartFor(charts, "search")
  assert.equal(search.left.key, "cost")
  assert.equal(search.left.format, "money")
  assert.equal(search.right?.key, "clicks")
  assert.equal(search.right?.format, "count")
  assert.deepEqual(search.points, [
    ["2026-07-01", 3.25, 2],
    ["2026-07-02", 0, 0],
    ["2026-07-03", 5.25, 4],
  ])
})

test("CM360 channel uses impressions and clicks", () => {
  const charts = buildDeckCharts(
    {
      channels: [channel("digital_display", [line("dd1", 20)])],
      dailyPacingRows: [
        pacing({
          channel: "ad-serving",
          lineItemId: "dd1",
          dateDay: "2026-07-01",
          amountSpent: 99,
          impressions: 500,
          clicks: 7,
        }),
      ],
    },
    WINDOW,
  )
  const display = chartFor(charts, "digital_display")
  assert.equal(display.left.key, "impressions")
  assert.equal(display.left.format, "count")
  assert.equal(display.right?.key, "clicks")
  assert.equal(display.right?.format, "count")
  assert.deepEqual(display.points, [["2026-07-01", 500, 7]])
  assert.equal(charts.some((chart) => chart.scope === "campaign"), false)
})

test("programmatic CPV uses views, and a mixed buy type uses impressions", () => {
  const cpv = buildDeckCharts(
    {
      channels: [
        channel("programmatic_video", [line("pv1", 4, { buyType: "cpv" }), line("pv2", 6, { buyType: "CPV" })]),
      ],
      dailyPacingRows: [
        pacing({
          channel: "programmatic-video",
          lineItemId: "pv1",
          dateDay: "2026-07-02",
          amountSpent: 4,
          impressions: 80,
          video3sViews: 11,
          clicks: 1,
        }),
        pacing({
          channel: "programmatic-video",
          lineItemId: "pv2",
          dateDay: "2026-07-02",
          amountSpent: 6,
          impressions: 20,
          video3sViews: 3,
          clicks: 1,
        }),
      ],
    },
    WINDOW,
  )
  const views = chartFor(cpv, "programmatic_video")
  assert.equal(views.right?.key, "video_3s_views")
  assert.deepEqual(views.points, [["2026-07-01", 0, 0], ["2026-07-02", 10, 14]])

  const mixed = buildDeckCharts(
    {
      channels: [
        channel("programmatic_display", [line("pd1", 4, { buyType: "cpv" }), line("pd2", 6, { buyType: "cpm" })]),
      ],
      dailyPacingRows: [
        pacing({
          channel: "programmatic-display",
          lineItemId: "pd1",
          dateDay: "2026-07-02",
          amountSpent: 4,
          impressions: 80,
          video3sViews: 11,
        }),
        pacing({
          channel: "programmatic-display",
          lineItemId: "pd2",
          dateDay: "2026-07-02",
          amountSpent: 6,
          impressions: 20,
          video3sViews: 3,
        }),
      ],
    },
    WINDOW,
  )
  const impressions = chartFor(mixed, "programmatic_display")
  assert.equal(impressions.right?.key, "impressions")
  assert.deepEqual(impressions.points, [["2026-07-01", 0, 0], ["2026-07-02", 10, 100]])
})

test("notLive and assumed-spend channels get no chart", () => {
  const charts = buildDeckCharts(
    {
      channels: [
        channel("social_tiktok", [line("tt1", 0)], 0),
        channel("assumed_spend", [line("tv1", 40, { deliveryState: "assumed", spendMode: "assumed" })]),
        channel("plan_only", [line("po1", 15)]),
      ],
      dailyPacingRows: [pacing({ lineItemId: "tt1", dateDay: "2026-07-01", impressions: 10 })],
    },
    WINDOW,
  )
  assert.deepEqual(charts, [])
})

test("a pacing row whose line is not in the snapshot is dropped", () => {
  const charts = buildDeckCharts(
    {
      channels: [channel("social_meta", [line("meta1", 10)])],
      dailyPacingRows: [
        pacing({ lineItemId: "meta1", dateDay: "2026-07-01", amountSpent: 10, impressions: 5, clicks: 1 }),
        pacing({ lineItemId: "missing", dateDay: "2026-07-01", amountSpent: 99, impressions: 500, clicks: 50 }),
      ],
    },
    WINDOW,
  )
  const social = chartFor(charts, "social_meta")
  assert.deepEqual(social.points, [["2026-07-01", 10, 5]])
})

test("campaign chart sums reported spend and clicks through complete days", () => {
  const charts = buildDeckCharts(
    {
      channels: [
        channel("social_meta", [line("meta1", 10)]),
        channel("programmatic_display", [line("pd1", 5, { buyType: "cpm" })]),
        channel("search", [line("se1", 3)]),
      ],
      dailyPacingRows: [
        pacing({ lineItemId: "meta1", dateDay: "2026-07-01", amountSpent: 10, impressions: 100, clicks: 2 }),
        pacing({
          channel: "programmatic-display",
          lineItemId: "pd1",
          dateDay: "2026-07-01",
          amountSpent: 5,
          impressions: 40,
          clicks: 1,
        }),
        pacing({ lineItemId: "meta1", dateDay: "2026-07-02", amountSpent: 0, impressions: 1, clicks: 0 }),
      ],
      dailySearch: searchResponse("se1", [
        { date: "2026-07-01", cost: 3, clicks: 4, conversions: 0, revenue: 0, impressions: 9, topImpressionPct: null },
      ]),
    },
    WINDOW,
  )
  assert.equal(charts[0]?.scope, "campaign")
  assert.equal(charts[0]?.group, null)
  assert.equal(charts[0]?.label, "All channels")
  assert.equal(charts[0]?.left.key, "spend")
  assert.equal(charts[0]?.right?.key, "clicks")
  assert.equal(charts[0]?.note, "Chart shows complete days to 3 Jul.")
  assert.deepEqual(charts[0]?.points, [
    ["2026-07-01", 18, 7],
    ["2026-07-02", 0, 0],
  ])
})

test("social and search left points reconcile to daily rows through the chart end", () => {
  const socialThroughEnd = 10.1 + 5.25
  const searchThroughEnd = 3.2 + 1.05
  const socialAfter = 9.5
  const searchAfter = 4.4
  const charts = buildDeckCharts(
    {
      channels: [
        channel("social_meta", [line("meta1", socialThroughEnd + socialAfter)]),
        channel("search", [line("se1", searchThroughEnd + searchAfter)]),
      ],
      dailyPacingRows: [
        pacing({ lineItemId: "meta1", dateDay: "2026-07-01", amountSpent: 10.1, impressions: 10, clicks: 1 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-07-02", amountSpent: 5.25, impressions: 4, clicks: 1 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-07-04", amountSpent: socialAfter, impressions: 8, clicks: 2 }),
      ],
      dailySearch: searchResponse("se1", [
        { date: "2026-07-01", cost: 3.2, clicks: 2, conversions: 0, revenue: 0, impressions: 1, topImpressionPct: null },
        { date: "2026-07-02", cost: 1.05, clicks: 1, conversions: 0, revenue: 0, impressions: 1, topImpressionPct: null },
        { date: "2026-07-05", cost: searchAfter, clicks: 3, conversions: 0, revenue: 0, impressions: 2, topImpressionPct: null },
      ]),
    },
    WINDOW,
  )
  const social = chartFor(charts, "social_meta")
  const search = chartFor(charts, "search")
  assert.equal(social.points[social.points.length - 1]?.[0], "2026-07-02")
  assert.equal(Math.round(sumLeft(social) * 100), Math.round(socialThroughEnd * 100))
  assert.notEqual(Math.round(sumLeft(social) * 100), Math.round((socialThroughEnd + socialAfter) * 100))
  assert.equal(Math.round(sumLeft(search) * 100), Math.round(searchThroughEnd * 100))
  assert.notEqual(Math.round(sumLeft(search) * 100), Math.round((searchThroughEnd + searchAfter) * 100))
})

test("charts end two days before asOf and name that date", () => {
  const charts = buildDeckCharts(
    {
      channels: [
        channel("social_meta", [line("meta1", 33)]),
        channel("digital_display", [line("dd1", 5)]),
      ],
      dailyPacingRows: [
        pacing({ lineItemId: "meta1", dateDay: "2026-10-13", amountSpent: 10, impressions: 1, clicks: 1 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-10-14", amountSpent: 11, impressions: 1, clicks: 1 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-10-15", amountSpent: 12, impressions: 1, clicks: 1 }),
        pacing({
          channel: "ad-serving",
          lineItemId: "dd1",
          dateDay: "2026-10-13",
          impressions: 4,
          clicks: 1,
        }),
      ],
    },
    { startISO: "2026-10-01", endISO: "2026-10-15" },
  )
  assert.equal(charts[0]?.scope, "campaign")
  assert.equal(charts[0]?.points.at(-1)?.[0], "2026-10-13")
  assert.equal(
    charts[0]?.note,
    "Reported daily spend. Excludes assumed and estimated spend. Chart shows complete days to 13 Oct.",
  )
  const social = chartFor(charts, "social_meta")
  assert.equal(social.points.at(-1)?.[0], "2026-10-13")
  assert.equal(social.points.some((point) => point[0] > "2026-10-13"), false)
  assert.equal(social.note, "Chart shows complete days to 13 Oct.")
})

test("a window of two days has no chart", () => {
  const charts = buildDeckCharts(
    {
      channels: [channel("social_meta", [line("meta1", 10)])],
      dailyPacingRows: [
        pacing({ lineItemId: "meta1", dateDay: "2026-10-14", amountSpent: 4, impressions: 1, clicks: 1 }),
        pacing({ lineItemId: "meta1", dateDay: "2026-10-15", amountSpent: 6, impressions: 1, clicks: 1 }),
      ],
    },
    { startISO: "2026-10-14", endISO: "2026-10-15" },
  )
  assert.deepEqual(charts, [])
})
