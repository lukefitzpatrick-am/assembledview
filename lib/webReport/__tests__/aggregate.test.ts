import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildGa4Slice, buildGscSlice } from "../aggregate"
import { elementViewState } from "../elementState"
import { emptyTotals, type WebReportData } from "../types"

const windows = {
  period: "last_month" as const,
  current: { from: "2026-09-01", to: "2026-09-30" },
  previous: { from: "2026-08-01", to: "2026-08-31" },
  phrase: "September 2026",
  comparedWith: "August 2026",
}

describe("GA4 and Search Console rollup", () => {
  it("keeps source and medium as needs_report when the campaign rows leave them null", () => {
    const slice = buildGa4Slice({
      connected: true,
      today: "2026-10-14",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-13",
      campaign: [
        { date: "2026-09-02", source: null, medium: null, sessions: 10, engagedSessions: 4, keyEvents: 2 },
      ],
      landing: [
        { date: "2026-09-02", pagePath: "/join", users: 8, keyEvents: 1, pageViews: 20 },
      ],
    })
    assert.equal(slice.status, "ok")
    assert.equal(slice.pageViewsSource, "V_GA4_LANDING_DAILY.screen_page_views")
    assert.equal(slice.current.sessions, 10)
    assert.equal(slice.current.engagementRate, 0.4)
    assert.equal(slice.current.pageViews, 20)
    assert.equal(slice.sourceMediumStatus, "needs_report")
    assert.deepEqual(slice.keyEventsByName, [])
    assert.equal(slice.pages[0]?.page, "/join")
  })

  it("marks a source stale when the latest date is more than 7 days old", () => {
    const slice = buildGscSlice({
      connected: true,
      today: "2026-10-14",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-01",
      dailyRows: [
        { date: "2026-09-01", clicks: 10, impressions: 100, position: 4 },
        { date: "2026-09-02", clicks: 30, impressions: 300, position: 2 },
      ],
      currentQueries: [{ query: "Golf Australia membership", clicks: 12, impressions: 40, position: 3 }],
      brandTerms: ["golf australia"],
    })
    assert.equal(slice.status, "stale")
    assert.equal(slice.current.position, (4 * 100 + 2 * 300) / 400)
    assert.equal(slice.current.ctr, 40 / 400)
    assert.equal(slice.queries[0]?.brand, true)
    assert.equal(slice.pagesStatus, "needs_report")
  })
})

function report(patch: Partial<WebReportData["ga4"]> & { gsc?: Partial<WebReportData["gsc"]>; paid?: Partial<WebReportData["paid"]> }): WebReportData {
  return {
    windows,
    ga4Property: "properties/123",
    gscSite: "sc-domain:golf.org.au",
    ga4: {
      status: "ok",
      maxDate: "2026-10-13",
      message: null,
      pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
      current: { ...emptyTotals(), keyEvents: 4 },
      previous: emptyTotals(),
      daily: [],
      sourceMedium: [],
      sourceMediumStatus: "needs_report",
      pages: [],
      landing: [],
      keyEventsByName: [],
      ...patch,
    },
    gsc: {
      status: "ok",
      maxDate: "2026-10-01",
      message: "Search Console data stopped on 2026-10-01",
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      queries: [],
      pagesStatus: "needs_report",
      ...patch.gsc,
    },
    paid: {
      status: "ok",
      message: null,
      spend: 200,
      previousSpend: 100,
      byChannel: [{ channel: "Paid media", spend: 200 }],
      ...patch.paid,
    },
  }
}

describe("element states", () => {
  it("location, events, search pages and source/medium are not available yet", () => {
    const data = report({})
    for (const id of ["location", "events", "gscPages", "srcmed"] as const) {
      const state = elementViewState(id, data)
      assert.equal(state.status, "needs_report")
      assert.equal(state.message, "Not available yet")
    }
  })

  it("names the date Search Console stopped", () => {
    const state = elementViewState("queries", report({ gsc: { status: "stale", maxDate: "2026-10-01" } }))
    assert.equal(state.status, "stale")
    assert.match(state.message, /Search Console data stopped on/)
  })

  it("a missing property is not connected, and a thrown source is an error", () => {
    assert.equal(elementViewState("traffic", report({ status: "not_connected" })).message, "Not connected yet")
    assert.equal(elementViewState("paidSpend", report({ paid: { status: "error", message: "Paid media could not be read" } })).status, "error")
    assert.equal(elementViewState("traffic", report({ status: "empty" })).status, "empty")
  })
})
