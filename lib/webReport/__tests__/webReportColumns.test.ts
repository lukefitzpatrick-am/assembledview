/**
 * REP-6 (Luke 28 Oct 2026): a Paid social element across every platform in
 * SOCIAL_PACING_FACT with a platform filter (spend, impressions, clicks), an
 * average engagement time column on the page title table, and Total users on
 * the city table. Every option is off by default, so saved reports read as
 * they did.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { collectSocialLineItemIds } from "@/lib/delivery/deliveredTotals"
import { buildGa4Slice, pageEngagementRowsFromWarehouse } from "@/lib/webReport/aggregate"
import { defaultElementSettings } from "@/lib/webReport/builder/layout"
import { describeElementSettings } from "@/lib/webReport/builder/settingsForm"
import { formatEngagementTime, prepareWebElement } from "@/lib/webReport/displayModel"
import { elementViewState } from "@/lib/webReport/elementState"
import { parseElementSettings, WEB_REPORT_ELEMENTS } from "@/lib/webReport/elements"
import {
  filterSocialAdsRows,
  readSocialAdsWith,
  socialAdsBinds,
  socialAdsRowsFromWarehouse,
  socialAdsSql,
  socialPlatformOf,
} from "@/lib/webReport/socialAds"
import { emptyTotals, type Ga4Slice, type SocialAdsSlice, type WebReportData } from "@/lib/webReport/types"

const current = { from: "2026-09-28", to: "2026-10-25" }
const previous = { from: "2026-08-31", to: "2026-09-27" }

const socialRows = [
  { CAMPAIGN_NAME: "BIC_FY27_Awareness", CHANNEL: "Social - Meta", CUR_IMPRESSIONS: 120_000, CUR_CLICKS: 900, CUR_SPEND: "1500.50", PREV_IMPRESSIONS: 100_000, PREV_CLICKS: 800, PREV_SPEND: 1200 },
  { CAMPAIGN_NAME: "BIC_FY27_Conversion", CHANNEL: "Social - Meta", CUR_IMPRESSIONS: 30_000, CUR_CLICKS: 600, CUR_SPEND: 499.5, PREV_IMPRESSIONS: 0, PREV_CLICKS: 0, PREV_SPEND: 0 },
  { CAMPAIGN_NAME: "BIC_FY27_Awareness_TT", CHANNEL: "Social - TikTok", CUR_IMPRESSIONS: 50_000, CUR_CLICKS: 250, CUR_SPEND: 800, PREV_IMPRESSIONS: 40_000, PREV_CLICKS: 200, PREV_SPEND: 800 },
  { CAMPAIGN_NAME: "BIC_FY27_Reddit", CHANNEL: "Social - Reddit", CUR_IMPRESSIONS: 10_000, CUR_CLICKS: 50, CUR_SPEND: 200, PREV_IMPRESSIONS: 0, PREV_CLICKS: 0, PREV_SPEND: 0 },
]

function ga4(overrides: Partial<Ga4Slice> = {}): Ga4Slice {
  return {
    status: "ok", maxDate: "2026-10-25", message: null, pageViewsSource: null,
    current: emptyTotals(), previous: emptyTotals(), daily: [], sourceMedium: [], sourceMediumStatus: "ok",
    pages: [], landing: [], keyEventsByName: [], cities: [],
    ...overrides,
  }
}

function report(input: { socialAds?: SocialAdsSlice; ga4?: Ga4Slice } = {}): WebReportData {
  return {
    windows: { period: "last_28_days", current, previous, phrase: "Last 28 days", comparedWith: "Previous 28 days" },
    ga4Property: "372647707",
    gscSite: null,
    ga4: input.ga4 ?? ga4(),
    gsc: { status: "not_connected", maxDate: null, message: null, current: emptyTotals(), previous: emptyTotals(), daily: [], queries: [], pages: [], pagesStatus: "not_connected" },
    paid: { status: "ok", message: null, spend: 1, previousSpend: 1, byChannel: [] },
    ...(input.socialAds ? { socialAds: input.socialAds } : {}),
  }
}

describe("paid social element", () => {
  it("collects social line ids (every social group and plan_only), lowercased", () => {
    const ids = new Set<string>()
    collectSocialLineItemIds(
      [
        {
          channels: [
            { group: "social_meta", lines: [{ lineItemId: " BICAU006SM1 " }] },
            { group: "social_tiktok", lines: [{ lineItemId: "bicau006tt1" }] },
            { group: "plan_only", lines: [{ lineItemId: "bicau006sm9" }] },
            { group: "search", lines: [{ lineItemId: "bicau006se1" }] },
          ],
        },
        null,
      ],
      ids,
    )
    assert.deepEqual([...ids].sort(), ["bicau006sm1", "bicau006sm9", "bicau006tt1"])
  })

  it("binds both windows, the ids once, then the span", () => {
    const sql = socialAdsSql(2)
    assert.match(sql, /FROM ASSEMBLEDVIEW\.MART\.SOCIAL_PACING_FACT/)
    assert.equal((sql.match(/\?/g) ?? []).length, 12 + 2 + 2)
    assert.deepEqual(socialAdsBinds(["a", "b"], current, previous), [
      ...Array(3).fill(["2026-09-28", "2026-10-25"]).flat(),
      ...Array(3).fill(["2026-08-31", "2026-09-27"]).flat(),
      "a", "b", "2026-08-31", "2026-10-25",
    ])
  })

  it("does not query with no social line items, and a failed read stays on the element", async () => {
    let called = false
    const empty = await readSocialAdsWith({ lineItemIds: new Set(), current, previous, query: async () => { called = true; return [] } })
    assert.equal(called, false)
    assert.equal(empty.status, "empty")
    const failed = await readSocialAdsWith({ lineItemIds: new Set(["x"]), current, previous, query: async () => { throw new Error("down") } })
    assert.equal(failed.status, "error")
    assert.equal(elementViewState("socialAds", report({ socialAds: failed })).status, "error")
  })

  it("reads the platform from the channel and filters by platform and campaign", () => {
    assert.equal(socialPlatformOf("Social - Meta"), "meta")
    assert.equal(socialPlatformOf("Social - TikTok"), "tiktok")
    assert.equal(socialPlatformOf("Social - Reddit"), "reddit")
    assert.equal(socialPlatformOf("Social - Pinterest"), null)
    const rows = socialAdsRowsFromWarehouse(socialRows)
    assert.equal(filterSocialAdsRows(rows, { platform: "all" }).length, 4)
    assert.equal(filterSocialAdsRows(rows, { platform: "meta" }).length, 2)
    assert.equal(filterSocialAdsRows(rows, { platform: "tiktok" }).length, 1)
    assert.deepEqual(
      filterSocialAdsRows(rows, { platform: "all", campaignContains: "awareness" }).map((row) => row.channel),
      ["Social - Meta", "Social - TikTok"],
    )
  })

  it("shows spend, impressions and clicks for every platform, with change", async () => {
    const slice = await readSocialAdsWith({ lineItemIds: new Set(["bicau006sm1"]), current, previous, query: async () => socialRows })
    const model = prepareWebElement(
      { elementId: "socialAds", settings: defaultElementSettings("socialAds") },
      report({ socialAds: slice }),
    )
    assert.equal(model.kind, "tiles")
    if (model.kind !== "tiles") return
    assert.deepEqual(model.tiles.map((tile) => [tile.label, tile.current, tile.change?.text]), [
      ["Paid social spend", 3000, "+50.0%"],
      ["Paid social impressions", 210_000, "+50.0%"],
      ["Paid social clicks", 1800, "+80.0%"],
    ])
  })

  it("filters to Meta and names the tiles Meta Ads", async () => {
    const slice = await readSocialAdsWith({ lineItemIds: new Set(["bicau006sm1"]), current, previous, query: async () => socialRows })
    const model = prepareWebElement(
      { elementId: "socialAds", settings: { tiles: ["spend"], platform: "meta" } },
      report({ socialAds: slice }),
    )
    assert.equal(model.kind, "tiles")
    if (model.kind !== "tiles") return
    assert.equal(model.tiles[0]?.label, "Meta Ads spend")
    assert.equal(model.tiles[0]?.current, 2000)
    assert.equal(model.tiles[0]?.change, undefined)
  })

  it("is a Paid media element with valid defaults, and reads Not available yet on old data", () => {
    assert.equal(WEB_REPORT_ELEMENTS.socialAds.group, "Paid media")
    assert.equal(parseElementSettings("socialAds", defaultElementSettings("socialAds")).ok, true)
    assert.equal(elementViewState("socialAds", report()).message, "Not available yet")
    const platform = describeElementSettings("socialAds").find((field) => field.key === "platform")
    assert.ok(platform && platform.kind === "enum")
    if (platform.kind === "enum") assert.deepEqual(platform.options, ["all", "meta", "tiktok", "reddit"])
  })
})

describe("page title average engagement time", () => {
  const pages = [
    { page: "Home", pageViews: 1000, users: 400, keyEvents: 10, engagementSeconds: 26_000, previous: { pageViews: 800, users: 400, keyEvents: 8, engagementSeconds: 20_000 } },
    { page: "Shop", pageViews: 500, users: 0, keyEvents: 2, engagementSeconds: 0, previous: { pageViews: 0, users: 0, keyEvents: 0, engagementSeconds: 0 } },
  ]

  it("is off by default: saved settings keep the old columns", () => {
    const model = prepareWebElement({ elementId: "pages", settings: { topN: 10 } }, report({ ga4: ga4({ pages, pageEngagementStatus: "ok" }) }))
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.deepEqual(model.headers, ["Page title", "Page views", "Users", "Key events"])
    assert.equal(parseElementSettings("pages", { topN: 10, compare: true }).ok, true)
  })

  it("adds engagement time ÷ users when switched on", () => {
    const model = prepareWebElement(
      { elementId: "pages", settings: { topN: 10, engagementTime: true } },
      report({ ga4: ga4({ pages, pageEngagementStatus: "ok" }) }),
    )
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.deepEqual(model.headers, ["Page title", "Page views", "Users", "Key events", "Avg engagement time"])
    assert.equal(model.rows[0]?.cells[4]?.text, "1m 05s")
    assert.equal(model.rows[1]?.cells[4]?.text, "—")
    assert.match(model.note ?? "", /engagement time ÷ users/)
  })

  it("shows change on the average when compare is on", () => {
    const model = prepareWebElement(
      { elementId: "pages", settings: { topN: 10, engagementTime: true, compare: true } },
      report({ ga4: ga4({ pages, pageEngagementStatus: "ok" }) }),
    )
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.equal(model.headers.at(-2), "Avg engagement time")
    // 65s vs 50s.
    assert.equal(model.rows[0]?.cells.at(-1)?.text, "+30.0%")
  })

  it("says not available yet until the view has the engagement column", () => {
    const model = prepareWebElement(
      { elementId: "pages", settings: { topN: 10, engagementTime: true } },
      report({ ga4: ga4({ pages, pageEngagementStatus: "needs_report" }) }),
    )
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.equal(model.rows[0]?.cells[4]?.text, "—")
    assert.match(model.note ?? "", /not available yet/)
  })

  it("buildGa4Slice joins engagement seconds per title and window", () => {
    const slice = buildGa4Slice({
      connected: true,
      today: "2026-10-26",
      current,
      previous,
      maxDate: "2026-10-25",
      campaign: [],
      landing: [],
      sourceMedium: [],
      events: [],
      pageTitles: [
        { date: "2026-10-01", pageTitle: "Home", users: 400, newUsers: 10, keyEvents: 10, pageViews: 1000 },
        { date: "2026-09-01", pageTitle: "Home", users: 400, newUsers: 10, keyEvents: 8, pageViews: 800 },
      ],
      pageEngagement: pageEngagementRowsFromWarehouse([
        { PAGE_TITLE: "Home", CUR_ENGAGEMENT_SECONDS: 26_000, PREV_ENGAGEMENT_SECONDS: 20_000 },
      ]),
    })
    assert.equal(slice.pageEngagementStatus, "ok")
    assert.equal(slice.pages[0]?.engagementSeconds, 26_000)
    assert.equal(slice.pages[0]?.previous?.engagementSeconds, 20_000)
    const missing = buildGa4Slice({
      connected: true, today: "2026-10-26", current, previous, maxDate: "2026-10-25",
      campaign: [], landing: [], sourceMedium: [], events: [], pageTitles: [], pageEngagement: null,
    })
    assert.equal(missing.pageEngagementStatus, "needs_report")
  })

  it("formats engagement time", () => {
    assert.equal(formatEngagementTime(35.4), "35s")
    assert.equal(formatEngagementTime(65), "1m 05s")
    assert.equal(formatEngagementTime(null), "—")
  })
})

describe("city table total users", () => {
  const cities = [
    { city: "Melbourne", totalUsers: 1200, engagedSessions: 900, newUsers: 300, keyEvents: 20, keyEventRate: 20 / 900 },
    { city: "(not set)", totalUsers: 50, engagedSessions: 10, newUsers: 5, keyEvents: 0, keyEventRate: 0 },
  ]

  it("is off by default", () => {
    const model = prepareWebElement({ elementId: "location", settings: { topN: 10 } }, report({ ga4: ga4({ cities }) }))
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.deepEqual(model.headers, ["City", "Engaged sessions", "New users", "Key events", "Key event rate"])
  })

  it("adds Total users (sum of daily) when switched on", () => {
    assert.equal(parseElementSettings("location", { topN: 10, totalUsers: true }).ok, true)
    const model = prepareWebElement({ elementId: "location", settings: { topN: 10, totalUsers: true } }, report({ ga4: ga4({ cities }) }))
    assert.equal(model.kind, "table")
    if (model.kind !== "table") return
    assert.deepEqual(model.headers, ["City", "Total users", "Engaged sessions", "New users", "Key events", "Key event rate"])
    assert.equal(model.rows[0]?.cells[1]?.text, "1,200")
    assert.match(model.note ?? "", /summed across days/)
  })
})
