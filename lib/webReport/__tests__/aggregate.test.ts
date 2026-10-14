import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

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
  it("rolls source, users, named events and page titles from their own rows", () => {
    const slice = buildGa4Slice({
      connected: true,
      today: "2026-10-14",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-13",
      campaign: [
        { date: "2026-09-02", sessions: 10, engagedSessions: 4, keyEvents: 2 },
      ],
      landing: [
        { date: "2026-09-02", pagePath: "/join", users: 8, keyEvents: 1, pageViews: 20 },
      ],
      sourceMedium: [
        {
          date: "2026-09-02",
          source: "google",
          medium: "organic",
          sessions: 6,
          engagedSessions: 3,
          keyEvents: 1,
          totalUsers: 5,
        },
        {
          date: "2026-09-03",
          source: "google",
          medium: "organic",
          sessions: 4,
          engagedSessions: 2,
          keyEvents: 1,
          totalUsers: 4,
        },
        {
          date: "2026-08-02",
          source: "google",
          medium: "organic",
          sessions: 1,
          engagedSessions: 1,
          keyEvents: 0,
          totalUsers: 9,
        },
      ],
      events: [
        { date: "2026-09-02", eventName: "purchase", eventCount: 3 },
        { date: "2026-09-03", eventName: "purchase", eventCount: 2 },
        { date: "2026-08-15", eventName: "purchase", eventCount: 1 },
      ],
      pageTitles: [
        { date: "2026-09-02", pageTitle: "Join", users: 7, newUsers: 2, keyEvents: 1, pageViews: 11 },
      ],
    })
    assert.equal(slice.status, "ok")
    assert.equal(slice.pageViewsSource, "V_GA4_LANDING_DAILY.screen_page_views")
    assert.equal(slice.current.sessions, 10)
    assert.equal(slice.current.engagementRate, 0.4)
    assert.equal(slice.current.pageViews, 20)
    assert.equal(slice.current.users, 9)
    assert.equal(slice.previous.users, 9)
    assert.equal(slice.sourceMediumStatus, "ok")
    assert.equal(slice.sourceMedium[0]?.source, "google")
    assert.equal(slice.sourceMedium[0]?.medium, "organic")
    assert.equal(slice.sourceMedium[0]?.sessions, 10)
    assert.deepEqual(slice.keyEventsByName, [{ name: "purchase", count: 5, previous: 1 }])
    assert.equal(slice.pages[0]?.page, "Join")
    assert.equal(slice.landing[0]?.page, "/join")
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
  it("location, events and search pages stay unavailable", () => {
    const data = report({})
    for (const id of ["location", "events", "gscPages"] as const) {
      const state = elementViewState(id, data)
      assert.equal(state.status, "needs_report")
      assert.equal(state.message, "Not available yet")
    }
  })

  it("source / medium is ready when that view returned rows", () => {
    const state = elementViewState(
      "srcmed",
      report({
        sourceMediumStatus: "ok",
        sourceMedium: [
          { source: "google", medium: "organic", sessions: 10, keyEvents: 2, engagementRate: 0.5 },
        ],
      }),
    )
    assert.equal(state.status, "ok")
    assert.equal(state.message, "")
  })

  it("names the date Search Console stopped", () => {
    const state = elementViewState("queries", report({ gsc: { status: "stale", maxDate: "2026-10-01" } }))
    assert.equal(state.status, "stale")
    assert.match(state.message, /Search Console data stopped on/)
  })

  it("reader SQL selects the new GA4 and creative columns", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
    const ga4 = readFileSync(join(root, "lib/webReport/data/ga4.ts"), "utf8")
    const campaign = ga4.slice(ga4.indexOf("const CAMPAIGN_SQL"), ga4.indexOf("const LANDING_SQL"))
    assert.match(campaign, /V_GA4_CAMPAIGN_DAILY/)
    assert.doesNotMatch(campaign, /session_source/)
    assert.doesNotMatch(campaign, /session_medium/)
    assert.match(ga4, /V_GA4_SOURCE_MEDIUM_DAILY/)
    assert.match(ga4, /session_source/)
    assert.match(ga4, /session_medium/)
    assert.match(ga4, /total_users/)
    assert.match(ga4, /V_GA4_EVENTS_DAILY/)
    assert.match(ga4, /event_name/)
    assert.match(ga4, /event_count/)
    assert.match(ga4, /V_GA4_PAGE_TITLE_DAILY/)
    assert.match(ga4, /page_title/)
    assert.match(ga4, /new_users/)

    const creative = readFileSync(join(root, "lib/creative/performance/getCreativePerformance.ts"), "utf8")
    assert.match(creative, /creative_size/)
    assert.match(creative, /viewable_impressions/)
  })

  it("a missing property is not connected, and a thrown source is an error", () => {
    assert.equal(elementViewState("traffic", report({ status: "not_connected" })).message, "Not connected yet")
    assert.equal(elementViewState("paidSpend", report({ paid: { status: "error", message: "Paid media could not be read" } })).status, "error")
    assert.equal(elementViewState("traffic", report({ status: "empty" })).status, "empty")
  })
})
