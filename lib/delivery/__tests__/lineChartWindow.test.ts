import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addDaysISO,
  chartWindow,
  fitDailyRows,
  isoDayList,
  lineDatesFromBursts,
} from "../lineChartWindow"
import { fitSectionCharts } from "@/components/dashboard/delivery/channels/fitChartWindows"
import type { ChannelSectionData } from "@/components/dashboard/delivery/channels/types"

const CAMPAIGN = { startISO: "2026-08-01", endISO: "2026-12-31" }
const TODAY = "2026-10-20"

test("day list crosses month ends and the October daylight saving change", () => {
  assert.deepEqual(isoDayList("2026-09-30", "2026-10-02"), ["2026-09-30", "2026-10-01", "2026-10-02"])
  assert.deepEqual(isoDayList("2026-10-03", "2026-10-05"), ["2026-10-03", "2026-10-04", "2026-10-05"])
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01")
  assert.deepEqual(isoDayList("2026-10-05", "2026-10-04"), [])
})

test("line dates: earliest burst start, latest burst end", () => {
  const dates = lineDatesFromBursts(
    [
      { start_date: "2026-10-01", end_date: "2026-10-31" },
      { start_date: "2026-09-15", end_date: "2026-09-30" },
    ],
    CAMPAIGN,
  )
  assert.deepEqual(dates, { startISO: "2026-09-15", endISO: "2026-10-31" })
})

test("line dates: bursts_json string is read", () => {
  const dates = lineDatesFromBursts(JSON.stringify([{ startDate: "2026-10-09", endDate: "2026-11-09" }]), CAMPAIGN)
  assert.deepEqual(dates, { startISO: "2026-10-09", endISO: "2026-11-09" })
})

test("line dates: no bursts falls back to the campaign", () => {
  assert.deepEqual(lineDatesFromBursts(null, CAMPAIGN), CAMPAIGN)
})

test("live line: line start to today", () => {
  assert.deepEqual(chartWindow({ startISO: "2026-10-09", endISO: "2026-11-30" }, { todayISO: TODAY }), {
    from: "2026-10-09",
    to: TODAY,
  })
})

test("finished line: line start to line end", () => {
  assert.deepEqual(chartWindow({ startISO: "2026-08-01", endISO: "2026-09-30" }, { todayISO: TODAY }), {
    from: "2026-08-01",
    to: "2026-09-30",
  })
})

test("date filter narrows the window inside the line dates", () => {
  const filter = { start: new Date(2026, 9, 1), end: new Date(2026, 10, 30) }
  assert.deepEqual(chartWindow({ startISO: "2026-09-15", endISO: "2026-12-31" }, { todayISO: TODAY, filter }), {
    from: "2026-10-01",
    to: TODAY,
  })
})

test("missing line dates gives no window", () => {
  assert.equal(chartWindow({ startISO: null, endISO: "2026-10-01" }, { todayISO: TODAY }), null)
})

test("fit: zero-fills gaps, drops rows outside the window", () => {
  const rows = [
    { date: "2026-10-07", spend: 99 },
    { date: "2026-10-09", spend: 10 },
    { date: "2026-10-11T00:00:00Z", spend: 5 },
  ]
  const out = fitDailyRows(rows, { from: "2026-10-09", to: "2026-10-12" }, ["spend"])
  assert.deepEqual(
    out.map((r) => [r.date, r.spend]),
    [
      ["2026-10-09", 10],
      ["2026-10-10", 0],
      ["2026-10-11", 5],
      ["2026-10-12", 0],
    ],
  )
})

test("fit: not started or all zero returns [] for the empty state", () => {
  assert.deepEqual(fitDailyRows([{ date: "2026-10-01", spend: 1 }], { from: "2026-11-01", to: TODAY }, ["spend"]), [])
  assert.deepEqual(fitDailyRows([], { from: "2026-10-01", to: "2026-10-03" }, ["spend"]), [])
})

function section(): ChannelSectionData {
  const series = [{ key: "impressions", label: "Impressions" }]
  const card = { title: "x", value: "0", progress: 0 } as never
  const line = (id: string, startISO: string, endISO: string, daily: Array<Record<string, string | number>>) => ({
    id,
    block: {
      name: id,
      progressCards: [card, card] as never,
      kpiBand: { title: "k", tiles: [] } as never,
      chart: {
        kind: "daily-delivery" as const,
        daily,
        series,
        asAtDate: TODAY,
        lineDates: { startISO, endISO },
      },
    },
  })
  return {
    key: "digital-display",
    title: "Digital display",
    dateRange: { startISO: CAMPAIGN.startISO, endISO: CAMPAIGN.endISO },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "#000",
    aggregate: {
      summaryChips: [],
      progressCards: [card, card] as never,
      kpiBand: { title: "k", tiles: [] } as never,
      chart: {
        daily: [
          { date: "2026-10-09", impressions: 100 },
          { date: "2026-10-19", impressions: 50 },
        ],
        series,
        asAtDate: TODAY,
      },
    },
    lineItems: [
      line("a", "2026-10-09", "2026-11-30", [
        { date: "2026-10-09", impressions: 100 },
        { date: "2026-10-19", impressions: 50 },
      ]),
      line("b", "2026-11-01", "2026-11-30", []),
    ],
  }
}

test("section: each line runs from its own start to today; channel from earliest start", () => {
  const out = fitSectionCharts(section(), { todayISO: TODAY })
  const a = out.lineItems[0].block.chart
  assert.equal(a.kind, "daily-delivery")
  if (a.kind !== "daily-delivery") return
  assert.equal(a.daily.length, 12)
  assert.equal(a.daily[0].date, "2026-10-09")
  assert.equal(a.daily.at(-1)?.date, TODAY)
  assert.equal(a.startsOn, "2026-10-09")

  const b = out.lineItems[1].block.chart
  if (b.kind !== "daily-delivery") return
  assert.deepEqual(b.daily, [])
  assert.equal(b.startsOn, "2026-11-01")

  assert.equal(out.aggregate.chart.daily[0].date, "2026-10-09")
  assert.equal(out.aggregate.chart.daily.at(-1)?.date, TODAY)
  assert.equal(out.aggregate.chart.startsOn, "2026-10-09")
})
