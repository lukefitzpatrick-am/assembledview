import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  calendarFromDaily,
  columnSpanClass,
  donutSlices,
  prepareWebElement,
  renderableDisplay,
  waterfallSteps,
} from "@/lib/webReport/displayModel"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import { emptyTotals, type DailyPoint, type SourceMediumRow, type WebReportData } from "@/lib/webReport/types"

function point(date: string, sessions: number | null): DailyPoint {
  return { date, sessions, pageViews: sessions, keyEvents: sessions, clicks: null, impressions: null }
}

function report(patch: Partial<WebReportData> = {}): WebReportData {
  return {
    windows: {
      period: "last_month",
      current: { from: "2026-09-01", to: "2026-09-30" },
      previous: { from: "2026-08-01", to: "2026-08-31" },
      phrase: "September 2026",
      comparedWith: "August 2026",
    },
    ga4Property: "1",
    gscSite: "https://example.com/",
    ga4: {
      status: "ok",
      maxDate: "2026-09-30",
      message: null,
      pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
      current: { ...emptyTotals(), sessions: 10, keyEvents: 2, pageViews: 20 },
      previous: emptyTotals(),
      daily: [point("2026-09-01", 4), point("2026-09-02", 6)],
      sourceMedium: [],
      sourceMediumStatus: "ok",
      pages: [],
      landing: [],
      keyEventsByName: [],
      cities: [],
      ...patch.ga4,
    },
    gsc: {
      status: "ok",
      maxDate: "2026-09-30",
      message: null,
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      queries: [],
      pages: [],
      pagesStatus: "ok",
      ...patch.gsc,
    },
    paid: {
      status: "ok",
      message: null,
      spend: 100,
      previousSpend: 80,
      byChannel: [],
      ...patch.paid,
    },
  }
}

const source = (sessions: number, previousSessions?: number, name = "google"): SourceMediumRow => ({
  source: name,
  medium: "organic",
  sessions,
  keyEvents: 1,
  engagementRate: 0.5,
  previousSessions,
})

describe("web report display model", () => {
  it("maps widths onto the 12-column grid and full width on a phone", () => {
    assert.equal(columnSpanClass(12), "min-w-0 md:col-span-12")
    assert.equal(columnSpanClass(6), "min-w-0 md:col-span-6")
    assert.equal(columnSpanClass(4), "min-w-0 md:col-span-4")
  })

  it("keeps a valid display and falls back when spark, bullet or waterfall data is missing", () => {
    const traffic: WebReportLayoutItem = { elementId: "traffic", settings: { bars: ["sessions"] }, display: "line" }
    assert.equal(renderableDisplay(traffic, report()), "line")
    const noDaily = report({ ga4: { ...report().ga4, daily: [] } })
    assert.equal(renderableDisplay({ ...traffic, display: "spark" }, noDaily), "combo")

    const kpis: WebReportLayoutItem = {
      elementId: "kpis",
      settings: { tiles: [{ kind: "metric", metric: "sessions" }] },
      display: "spark",
    }
    assert.equal(prepareWebElement(kpis, noDaily).kind, "tiles")
    const spark = prepareWebElement(kpis, report())
    assert.equal(spark.kind, "tiles")
    if (spark.kind === "tiles") assert.equal(spark.withSpark, true)

    const bullet: WebReportLayoutItem = {
      elementId: "kpis",
      settings: { tiles: [{ kind: "metric", metric: "sessions", target: 20 }, { kind: "metric", metric: "pageViews" }] },
      display: "bullet",
    }
    const withTarget = prepareWebElement(bullet, report())
    assert.equal(withTarget.kind, "bullet")
    if (withTarget.kind === "bullet") {
      assert.equal(withTarget.rows.length, 1)
      assert.equal(withTarget.plain.length, 1)
    }
    const noTarget = prepareWebElement(
      { ...bullet, settings: { tiles: [{ kind: "metric", metric: "sessions" }] } },
      report(),
    )
    assert.equal(noTarget.kind, "tiles")
  })

  it("builds a donut from sessions and a waterfall from previous sessions", () => {
    const rows = [source(4, 1, "google"), source(0, 3, "direct")]
    const slices = donutSlices(rows, 5)
    assert.deepEqual(slices.map((slice) => slice.value), [4])
    assert.equal(slices.some((slice) => slice.label.includes("direct")), false)

    const missing = waterfallSteps([source(4)])
    assert.equal(missing, null)
    const steps = waterfallSteps([
      source(10, 1, "a"),
      source(3, 9, "b"),
      source(1, 1, "c"),
      source(1, 1, "d"),
      source(1, 1, "e"),
      source(8, 0, "f"),
    ])
    assert.equal(steps?.length, 6)
    assert.equal(steps?.[5]?.label, "Other")

    const srcmed: WebReportLayoutItem = {
      elementId: "srcmed",
      settings: { topN: 10, columns: ["sessions"], showChange: false, shade: false },
      display: "waterfall",
    }
    const fallback = prepareWebElement(srcmed, report({
      ga4: { ...report().ga4, sourceMedium: [source(4)], sourceMediumStatus: "ok" },
    }))
    assert.equal(fallback.kind, "table")
    const ready = prepareWebElement(srcmed, report({
      ga4: { ...report().ga4, sourceMedium: [source(4, 1)], sourceMediumStatus: "ok" },
    }))
    assert.equal(ready.kind, "waterfall")
  })

  it("renders empty rows, notes, and unavailable elements without throwing", () => {
    const notes = prepareWebElement({ elementId: "notes", settings: { text: "Hello" } }, report())
    assert.deepEqual(notes, { kind: "text", title: "Notes", text: "Hello" })
    const empty = prepareWebElement(
      { elementId: "pages", settings: { topN: 10 }, display: "treemap" },
      report(),
    )
    assert.equal(empty.kind, "message")
    const events = prepareWebElement({ elementId: "events", settings: {} }, report())
    assert.equal(events.kind, "message")
    if (events.kind === "message") assert.equal(events.message, "Not available yet")
    const pages = prepareWebElement(
      { elementId: "pages", settings: { topN: 10 }, display: "bar" },
      report({ ga4: { ...report().ga4, pages: [{ page: "Join", pageViews: 2, users: 99, keyEvents: 1 }] } }),
    )
    assert.equal(pages.kind, "ranked")
    if (pages.kind === "ranked") assert.equal(pages.rows[0]?.value, 2)
  })

  it("places a Monday in week 0 day 0 of the calendar", () => {
    const calendar = calendarFromDaily([{ date: "2026-09-07", value: 5 }])
    assert.equal(new Date("2026-09-07T00:00:00Z").getUTCDay(), 1)
    assert.deepEqual(calendar.cells[0], { week: 0, day: 0, value: 1 })
  })
})
