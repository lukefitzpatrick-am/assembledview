import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { buildGa4Slice, buildGscSlice, rankCities } from "../aggregate"
import { readGa4 } from "../data/ga4"
import { readGsc } from "../data/gsc"
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
    assert.equal(slice.sourceMedium[0]?.previousSessions, 1)
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
      currentPages: [],
      brandTerms: ["golf australia"],
    })
    assert.equal(slice.status, "stale")
    assert.equal(slice.current.position, (4 * 100 + 2 * 300) / 400)
    assert.equal(slice.current.ctr, 40 / 400)
    assert.equal(slice.queries[0]?.brand, true)
    assert.equal(slice.pagesStatus, "stale")
    assert.deepEqual(slice.pages, [])
  })

  it("aggregates search pages to clicks, impressions, CTR and position", () => {
    const slice = buildGscSlice({
      connected: true,
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-18",
      dailyRows: [{ date: "2026-10-18", clicks: 10, impressions: 50, position: 2 }],
      currentQueries: [],
      currentPages: [
        { page: "https://www.molicare.au/products", clicks: 2, impressions: 20, position: 4 },
        { page: "https://www.molicare.au/", clicks: 8, impressions: 40, position: 2 },
      ],
      brandTerms: [],
    })
    assert.equal(slice.pagesStatus, "ok")
    assert.equal(slice.pages.length, 2)
    assert.equal(slice.pages[0]?.page, "https://www.molicare.au/")
    assert.equal(slice.pages[0]?.clicks, 8)
    assert.equal(slice.pages[0]?.impressions, 40)
    assert.equal(slice.pages[0]?.ctr, 8 / 40)
    assert.equal(slice.pages[0]?.position, 2)
    assert.equal(slice.pages[1]?.clicks, 2)
    assert.equal(slice.pages[1]?.impressions, 20)
    assert.equal(slice.pages[1]?.ctr, 2 / 20)
  })

  it("leaves search page CTR empty when impressions are zero", () => {
    const slice = buildGscSlice({
      connected: true,
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-18",
      dailyRows: [{ date: "2026-10-18", clicks: 1, impressions: 1, position: 1 }],
      currentQueries: [],
      currentPages: [{ page: "https://www.legalsuper.com.au/", clicks: 0, impressions: 0, position: null }],
      brandTerms: [],
    })
    assert.equal(slice.pages[0]?.ctr, null)
    assert.equal(slice.pages[0]?.clicks, 0)
    assert.equal(slice.pages[0]?.impressions, 0)
    assert.equal(slice.pages[0]?.position, null)
  })

  it("sorts search pages by clicks, then page", () => {
    const slice = buildGscSlice({
      connected: true,
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      maxDate: "2026-10-18",
      dailyRows: [{ date: "2026-10-18", clicks: 1, impressions: 1, position: 1 }],
      currentQueries: [],
      currentPages: [
        { page: "https://www.molicare.au/b", clicks: 3, impressions: 10, position: 1 },
        { page: "https://www.molicare.au/c", clicks: 9, impressions: 12, position: 2 },
        { page: "https://www.molicare.au/a", clicks: 3, impressions: 30, position: 5 },
      ],
      brandTerms: [],
    })
    assert.deepEqual(
      slice.pages.map((row) => row.page),
      ["https://www.molicare.au/c", "https://www.molicare.au/a", "https://www.molicare.au/b"],
    )
  })
})

describe("Search Console page read", () => {
  it("reads pages for the current window with the same binds as queries", async () => {
    const calls: { sql: string; binds: unknown[] }[] = []
    const slice = await readGsc({
      site: "https://www.molicare.au/",
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      brandTerms: [],
      query: async (sql, binds) => {
        calls.push({ sql, binds })
        if (sql.includes("V_GSC_PAGE_DAILY")) {
          return [
            { PAGE: "https://www.molicare.au/b", CLICKS: 1, IMPRESSIONS: 0, POSITION: null },
            { PAGE: "https://www.molicare.au/a", CLICKS: 4, IMPRESSIONS: 10, POSITION: 2 },
          ]
        }
        if (sql.includes("MAX")) return [{ MAX_DATE: "2026-10-18" }]
        if (sql.includes("V_GSC_SITE_DAILY") && sql.includes("MAX") === false) {
          return [{ DATE: "2026-09-02", CLICKS: 5, IMPRESSIONS: 10, POSITION: 2 }]
        }
        return []
      },
    })
    const pageCall = calls.find((call) => call.sql.includes("V_GSC_PAGE_DAILY"))
    const queryCall = calls.find((call) => call.sql.includes("V_GSC_QUERY_DAILY"))
    assert.deepEqual(pageCall?.binds, ["https://www.molicare.au/", windows.current.from, windows.current.to])
    assert.deepEqual(queryCall?.binds, pageCall?.binds)
    assert.deepEqual(
      slice.pages.map((row) => row.page),
      ["https://www.molicare.au/a", "https://www.molicare.au/b"],
    )
    assert.equal(slice.pages[0]?.ctr, 4 / 10)
    assert.equal(slice.pages[1]?.ctr, null)
    assert.equal(slice.pagesStatus, "ok")
  })

  it("a missing page view is an error on Search pages", async () => {
    const slice = await readGsc({
      site: "https://www.molicare.au/",
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      brandTerms: [],
      query: async () => {
        throw new Error("SQL compilation error: Object 'ASSEMBLEDVIEW.MART.V_GSC_PAGE_DAILY' does not exist or not authorized.")
      },
    })
    assert.equal(slice.status, "error")
    assert.equal(slice.pagesStatus, "error")
    assert.deepEqual(slice.pages, [])
    assert.equal(slice.message, "Search Console could not be read")
    const state = elementViewState("gscPages", report({ gsc: slice }))
    assert.equal(state.status, "error")
    assert.equal(state.message, "Search Console could not be read")
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
      cities: [],
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
      pages: [],
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

describe("GA4 cities", () => {
  it("ranks by engaged sessions and keeps (not set) last", () => {
    const cities = rankCities([
      { city: "(not set)", engagedSessions: 100, newUsers: 2, keyEvents: 1 },
      { city: "Sydney", engagedSessions: 40, newUsers: 8, keyEvents: 0 },
      { city: "Melbourne", engagedSessions: 40, newUsers: 3, keyEvents: 4 },
      { city: "Adelaide", engagedSessions: 0, newUsers: 1, keyEvents: 5 },
    ])
    assert.deepEqual(cities.map((row) => row.city), ["Melbourne", "Sydney", "Adelaide", "(not set)"])
    assert.equal(cities[0]?.keyEventRate, 4 / 40)
    assert.equal(cities[1]?.keyEventRate, 0)
    assert.equal(cities[2]?.keyEventRate, null)
    assert.equal(cities[3]?.engagedSessions, 100)
    assert.equal(cities[3]?.newUsers, 2)
  })

  it("reads the current window and reports a missing city view", async () => {
    const calls: { sql: string; binds: unknown[] }[] = []
    const slice = await readGa4({
      propertyId: "123",
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      query: async (sql, binds) => {
        calls.push({ sql, binds })
        if (sql.includes("V_GA4_CITY_DAILY")) {
          return [
            { CITY: "Sydney", ENGAGED_SESSIONS: 9, NEW_USERS: 4, KEY_EVENTS: 3 },
            { CITY: "(not set)", ENGAGED_SESSIONS: 20, NEW_USERS: 1, KEY_EVENTS: 0 },
          ]
        }
        if (sql.includes("MAX")) return [{ MAX_DATE: "2026-10-18" }]
        if (sql.includes("V_GA4_CAMPAIGN_DAILY")) {
          return [{ DATE: "2026-09-02", SESSIONS: 1, ENGAGED_SESSIONS: 1, KEY_EVENTS: 1 }]
        }
        return []
      },
    })
    const cityCall = calls.find((call) => call.sql.includes("V_GA4_CITY_DAILY"))
    assert.deepEqual(cityCall?.binds, ["123", windows.current.from, windows.current.to])
    assert.doesNotMatch(cityCall?.sql ?? "", /total_users/)
    assert.deepEqual(slice.cities.map((row) => row.city), ["Sydney", "(not set)"])
    assert.equal(slice.cities[0]?.keyEventRate, 3 / 9)

    const missing = await readGa4({
      propertyId: "123",
      today: "2026-10-19",
      current: windows.current,
      previous: windows.previous,
      query: async () => {
        throw new Error("SQL compilation error: Object 'ASSEMBLEDVIEW.MART.V_GA4_CITY_DAILY' does not exist or not authorized.")
      },
    })
    assert.equal(missing.status, "error")
    assert.equal(missing.message, "Google Analytics 4 could not be read")
    assert.deepEqual(missing.cities, [])
  })
})

describe("element states", () => {
  it("events stay unavailable", () => {
    const state = elementViewState("events", report({}))
    assert.equal(state.status, "needs_report")
    assert.equal(state.message, "Not available yet")
  })

  it("search trend, query opportunities and query positions follow the Search Console status", () => {
    assert.equal(elementViewState("gscTrend", report({})).status, "ok")
    assert.equal(elementViewState("queryBubble", report({ gsc: { status: "not_connected" } })).message, "Not connected yet")
    const stale = elementViewState("queryPositions", report({ gsc: { status: "stale", maxDate: "2026-10-01" } }))
    assert.equal(stale.status, "stale")
    assert.match(stale.message, /Search Console data stopped on/)
  })

  it("location follows the GA4 status", () => {
    assert.equal(elementViewState("location", report({})).status, "ok")
    const error = elementViewState("location", report({
      status: "error",
      message: "Google Analytics 4 could not be read",
    }))
    assert.equal(error.status, "error")
    assert.equal(error.message, "Google Analytics 4 could not be read")
  })

  it("search pages follow the page report status", () => {
    const ready = elementViewState(
      "gscPages",
      report({
        gsc: {
          status: "ok",
          pagesStatus: "ok",
          pages: [{ page: "https://www.molicare.au/", clicks: 4, impressions: 10, ctr: 0.4, position: 2 }],
        },
      }),
    )
    assert.equal(ready.status, "ok")
    assert.equal(ready.message, "")
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
    const city = ga4.slice(ga4.indexOf("const CITY_SQL"), ga4.indexOf("const MAX_SQL"))
    assert.match(city, /V_GA4_CITY_DAILY/)
    assert.match(city, /SUM\(engaged_sessions\)/)
    assert.match(city, /SUM\(new_users\)/)
    assert.match(city, /SUM\(key_events\)/)
    assert.doesNotMatch(city, /total_users/)

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
