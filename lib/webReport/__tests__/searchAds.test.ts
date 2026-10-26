import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { collectSearchLineItemIds } from "@/lib/delivery/deliveredTotals"
import { readSearchAdsWith as readSearchAds, searchAdsBinds, searchAdsSql } from "@/lib/webReport/searchAds"
import { prepareWebElement } from "@/lib/webReport/displayModel"
import { elementViewState } from "@/lib/webReport/elementState"
import { parseElementSettings } from "@/lib/webReport/elements"
import { defaultElementSettings } from "@/lib/webReport/builder/layout"
import { filterSearchAdsRows, searchAdsRowsFromWarehouse } from "@/lib/webReport/searchAds"
import { emptyTotals, type SearchAdsSlice, type WebReportData } from "@/lib/webReport/types"

const current = { from: "2026-09-28", to: "2026-10-25" }
const previous = { from: "2026-08-31", to: "2026-09-27" }

const warehouseRows = [
  { CAMPAIGN_NAME: "MoliCare_SEM_Brand_Broad_Skincare_Jan25", CHANNEL: "Search - Google Ads", CUR_IMPRESSIONS: 8853, CUR_CLICKS: 710, CUR_SPEND: "1963.25", PREV_IMPRESSIONS: 7887, PREV_CLICKS: 515, PREV_SPEND: 1500 },
  { CAMPAIGN_NAME: "MoliCare_SEM_Generic_Broad_General_Jan25", CHANNEL: "Search - Google Ads", CUR_IMPRESSIONS: 29144, CUR_CLICKS: 2514, CUR_SPEND: 9463.87, PREV_IMPRESSIONS: 17975, PREV_CLICKS: 1118, PREV_SPEND: 8000 },
  { CAMPAIGN_NAME: "MoliCare_Pmax_Inco_Nov25", CHANNEL: "PMax - Google Ads", CUR_IMPRESSIONS: 17902, CUR_CLICKS: 980, CUR_SPEND: 2931.84, PREV_IMPRESSIONS: 9649, PREV_CLICKS: 1180, PREV_SPEND: 2000 },
  { CAMPAIGN_NAME: "MoliCare_SEM_Generic_Broad_General_Jan25", CHANNEL: "Search - Microsoft Ads", CUR_IMPRESSIONS: 102322, CUR_CLICKS: 466, CUR_SPEND: 630.7, PREV_IMPRESSIONS: 77514, PREV_CLICKS: 349, PREV_SPEND: 600 },
]

function report(searchAds?: SearchAdsSlice): WebReportData {
  const ga4 = {
    status: "ok" as const, maxDate: "2026-10-25", message: null, pageViewsSource: null,
    current: emptyTotals(), previous: emptyTotals(), daily: [], sourceMedium: [], sourceMediumStatus: "ok" as const,
    pages: [], landing: [], keyEventsByName: [], cities: [],
  }
  return {
    windows: { period: "last_28_days", current, previous, phrase: "Last 28 days", comparedWith: "Previous 28 days" },
    ga4Property: "372647707",
    gscSite: null,
    ga4,
    gsc: { status: "not_connected", maxDate: null, message: null, current: emptyTotals(), previous: emptyTotals(), daily: [], queries: [], pages: [], pagesStatus: "not_connected" },
    paid: { status: "ok", message: null, spend: 1, previousSpend: 1, byChannel: [] },
    ...(searchAds ? { searchAds } : {}),
  }
}

describe("paid search tiles", () => {
  it("collects only search line ids from snapshots, lowercased", () => {
    const ids = new Set<string>()
    collectSearchLineItemIds(
      [
        { channels: [{ group: "search", lines: [{ lineItemId: " HARTM001SE5 " }] }, { group: "social_meta", lines: [{ lineItemId: "meta1" }] }] },
        null,
      ],
      ids,
    )
    assert.deepEqual([...ids], ["hartm001se5"])
  })

  it("binds both windows, the ids twice, then the span", () => {
    const sql = searchAdsSql(2)
    assert.equal((sql.match(/\?/g) ?? []).length, 12 + 4 + 2)
    assert.deepEqual(searchAdsBinds(["a", "b"], current, previous), [
      ...Array(3).fill(["2026-09-28", "2026-10-25"]).flat(),
      ...Array(3).fill(["2026-08-31", "2026-09-27"]).flat(),
      "a", "b", "a", "b", "2026-08-31", "2026-10-25",
    ])
  })

  it("does not query when the client has no search line items", async () => {
    let called = false
    const slice = await readSearchAds({ lineItemIds: new Set(), current, previous, query: async () => { called = true; return [] } })
    assert.equal(called, false)
    assert.equal(slice.status, "empty")
  })

  it("filters Google Ads campaigns by name, case-insensitive", () => {
    const rows = searchAdsRowsFromWarehouse(warehouseRows)
    assert.equal(filterSearchAdsRows(rows, { platform: "google" }).length, 3)
    assert.equal(filterSearchAdsRows(rows, { platform: "all" }).length, 4)
    assert.deepEqual(filterSearchAdsRows(rows, { platform: "google", campaignContains: "brand" }).map((row) => row.campaign), [
      "MoliCare_SEM_Brand_Broad_Skincare_Jan25",
    ])
  })

  it("shows brand impressions and clicks with change", async () => {
    const slice = await readSearchAds({ lineItemIds: new Set(["hartm001se5"]), current, previous, query: async () => warehouseRows })
    const model = prepareWebElement(
      { elementId: "searchAds", settings: { tiles: ["impressions", "clicks"], platform: "google", campaignContains: "Brand", label: "Brand Search", compare: true } },
      report(slice),
    )
    assert.equal(model.kind, "tiles")
    if (model.kind !== "tiles") return
    assert.deepEqual(model.tiles.map((tile) => [tile.label, tile.value, tile.change?.text, tile.caption]), [
      ["Brand Search impressions", "8,853", "+12.2%", '1 campaign containing "Brand"'],
      ["Brand Search clicks", "710", "+37.9%", '1 campaign containing "Brand"'],
    ])
  })

  it("reads Not available yet when the data has no paid search slice, and has valid defaults", () => {
    assert.equal(elementViewState("searchAds", report()).message, "Not available yet")
    assert.equal(parseElementSettings("searchAds", defaultElementSettings("searchAds")).ok, true)
  })
})
