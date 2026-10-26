import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { eventSum, prepareChange, prepareWebElement } from "@/lib/webReport/displayModel"
import { parseElementSettings, type WebReportLayoutItem } from "@/lib/webReport/elements"
import { describeElementSettings } from "@/lib/webReport/builder/settingsForm"
import { emptyTotals, type WebReportData } from "@/lib/webReport/types"

function report(): WebReportData {
  return {
    windows: {
      period: "last_28_days",
      current: { from: "2026-09-29", to: "2026-10-26" },
      previous: { from: "2026-09-01", to: "2026-09-28" },
      phrase: "Last 28 days",
      comparedWith: "Previous 28 days",
    },
    ga4Property: "372647707",
    gscSite: "https://www.molicare.au/",
    ga4: {
      status: "ok",
      maxDate: "2026-10-26",
      message: null,
      pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
      current: { ...emptyTotals(), users: 120, sessions: 200, engagementRate: 0.5 },
      previous: { ...emptyTotals(), users: 100, sessions: 0, engagementRate: 0.4 },
      daily: [],
      sourceMedium: [],
      sourceMediumStatus: "ok",
      pages: [],
      landing: [],
      keyEventsByName: [
        { name: "where_to_buy_click", count: 300, previous: 200 },
        { name: "chemist_warehouse_buy", count: 40, previous: 50 },
        { name: "joya_buy", count: 10, previous: 0 },
      ],
      cities: [],
    },
    gsc: {
      status: "ok",
      maxDate: "2026-10-26",
      message: null,
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      queries: [],
      pages: [],
      pagesStatus: "ok",
    },
    paid: { status: "ok", message: null, spend: 100, previousSpend: 80, byChannel: [] },
  }
}

function tiles(item: WebReportLayoutItem) {
  const model = prepareWebElement(item, report())
  assert.equal(model.kind, "tiles")
  return model.kind === "tiles" ? model.tiles : []
}

describe("event tiles and % change", () => {
  it("adds named events and treats names missing from the property as zero", () => {
    assert.deepEqual(eventSum(report(), ["chemist_warehouse_buy", "joya_buy", "not_on_property"]), { count: 50, previous: 50 })
  })

  it("formats change with a sign and a dash when the previous window is zero", () => {
    assert.deepEqual(prepareChange(120, 100), { text: "+20.0%", direction: "up" })
    assert.deepEqual(prepareChange(40, 50), { text: "-20.0%", direction: "down" })
    assert.deepEqual(prepareChange(10, 0), { text: "—", direction: "flat" })
  })

  it("leaves saved layouts without change when compare is absent", () => {
    const shown = tiles({ elementId: "snapshot", settings: { tiles: ["users", "sessions"] } })
    assert.equal(shown.length, 2)
    assert.ok(shown.every((tile) => tile.change === undefined))
    const kpi = tiles({ elementId: "kpis", settings: { tiles: [{ kind: "keyEvent", eventName: "where_to_buy_click" }] } })
    assert.equal(kpi[0].label, "where_to_buy_click")
    assert.equal(kpi[0].change, undefined)
  })

  it("shows KPI event, event sum and metric tiles with labels and change", () => {
    const shown = tiles({
      elementId: "kpis",
      settings: {
        compare: true,
        tiles: [
          { kind: "metric", metric: "users", label: "Website Visitors" },
          { kind: "keyEvent", eventName: "where_to_buy_click", label: "Where to Buy" },
          { kind: "eventSum", eventNames: ["chemist_warehouse_buy", "joya_buy"], label: "Total Buy Now" },
        ],
      },
    })
    assert.deepEqual(
      shown.map((tile) => [tile.label, tile.value, tile.change?.text]),
      [
        ["Website Visitors", "120", "+20.0%"],
        ["Where to Buy", "300", "+50.0%"],
        ["Total Buy Now", "50", "0.0%"],
      ],
    )
  })

  it("puts snapshot event tiles after the metric tiles, with only event tiles allowed", () => {
    const shown = tiles({
      elementId: "snapshot",
      settings: {
        compare: true,
        tiles: ["engagementRate"],
        eventTiles: [{ label: "Joya Medical Buy Now", eventNames: ["joya_buy"] }],
      },
    })
    assert.deepEqual(shown.map((tile) => [tile.label, tile.change?.text]), [
      ["Engagement rate", "+25.0%"],
      ["Joya Medical Buy Now", "—"],
    ])
    assert.equal(parseElementSettings("snapshot", { tiles: [], eventTiles: [{ label: "A", eventNames: ["x"] }] }).ok, true)
    assert.equal(parseElementSettings("snapshot", { tiles: [] }).ok, false)
    assert.equal(parseElementSettings("kpis", { tiles: [{ kind: "eventSum" }] }).ok, false)
  })

  it("describes the new settings for the builder form", () => {
    const snapshot = describeElementSettings("snapshot")
    assert.deepEqual(snapshot.map((field) => [field.key, field.kind]), [
      ["tiles", "enumList"],
      ["eventTiles", "objectList"],
      ["compare", "boolean"],
    ])
    const kpis = describeElementSettings("kpis")
    const tileFields = kpis.find((field) => field.key === "tiles")
    assert.ok(tileFields && tileFields.kind === "objectList")
    if (tileFields?.kind === "objectList") {
      assert.ok(tileFields.fields.some((field) => field.key === "eventNames" && field.kind === "stringList"))
      assert.ok(tileFields.fields.some((field) => field.key === "label" && field.kind === "string"))
    }
  })
})
