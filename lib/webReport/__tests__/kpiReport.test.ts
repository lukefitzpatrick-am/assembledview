import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { prepareWebElement } from "@/lib/webReport/displayModel"
import { elementSettings } from "@/lib/webReport/elements"
import {
  copyToAll,
  forwardMonths,
  increaseEachMonth,
  kpiEditorRows,
  previousMonths,
  targetsFromDraft,
} from "@/lib/webReport/kpis/editor"
import { parseKpiRequest } from "@/lib/webReport/kpis/request"
import {
  buildKpiReportItems,
  coverageNote,
  kpiTrackerRows,
  trackerMonthList,
  type WebKpiReportItem,
} from "@/lib/webReport/kpis/report"
import type { WebKpi } from "@/lib/webReport/kpis/types"
import { emptyTotals, type WebReportData } from "@/lib/webReport/types"

const KPI_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_ID = "22222222-2222-4222-8222-222222222222"

function item(overrides: Partial<WebKpiReportItem> = {}): WebKpiReportItem {
  return {
    id: KPI_ID,
    label: "Distributor clicks",
    source: "ga4_event",
    eventNames: ["where_to_buy_click"],
    metric: null,
    targets: [],
    window: { total: 0, months: [] },
    tracker: { total: 0, months: [] },
    ...overrides,
  }
}

function report(
  items: WebKpiReportItem[],
  window = { from: "2026-09-16", to: "2026-10-15" },
  today = "2026-10-15",
): WebReportData {
  return {
    windows: { period: "last_28_days", current: window, previous: window, phrase: "x", comparedWith: "y" },
    ga4Property: "1",
    gscSite: "https://example.com/",
    ga4: {
      status: "ok",
      maxDate: today,
      message: null,
      pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      sourceMedium: [],
      sourceMediumStatus: "ok",
      pages: [],
      landing: [],
      keyEventsByName: [],
      cities: [],
    },
    gsc: {
      status: "ok",
      maxDate: today,
      message: null,
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      queries: [],
      pages: [],
      pagesStatus: "ok",
    },
    paid: { status: "ok", message: null, spend: 0, previousSpend: 0, byChannel: [] },
    kpis: { status: "ok", today, trackerMonths: trackerMonthList(window), items },
  }
}

function tiles(data: WebReportData, kpiIds: string[], display: "tiles" | "bullet" | "spark" = "tiles") {
  return prepareWebElement(
    { elementId: "kpis", settings: { tiles: kpiIds.map((kpiId) => ({ kind: "savedKpi", kpiId })) }, display },
    data,
  )
}

describe("KPI target editor", () => {
  const months = forwardMonths("2026-10-20")

  it("offers 12 months forward from this month and the 12 before it", () => {
    assert.equal(months.length, 12)
    assert.equal(months[0], "2026-10-01")
    assert.equal(months[11], "2027-09-01")
    const previous = previousMonths("2026-10-20")
    assert.equal(previous[0], "2025-10-01")
    assert.equal(previous[11], "2026-09-01")
  })

  it("copies the first month to every month", () => {
    const next = copyToAll({ "2026-10-01": "500", "2026-11-01": "1" }, months)
    assert.deepEqual(new Set(months.map((month) => next[month])), new Set(["500"]))
    assert.deepEqual(copyToAll({}, months), {}, "a blank first month changes nothing")
  })

  it("increases each month by x%, compounding and rounded", () => {
    const next = increaseEachMonth({ "2026-10-01": "1000" }, months.slice(0, 4), 10)
    assert.deepEqual(
      months.slice(0, 4).map((month) => next[month]),
      ["1000", "1100", "1210", "1331"],
    )
    assert.deepEqual(increaseEachMonth({}, months, 10), {}, "needs a first month")
  })

  it("saves filled months only, as numbers, and refuses a negative target", () => {
    assert.deepEqual(targetsFromDraft({ "2026-11-01": "20", "2026-10-01": " 10 ", "2026-12-01": "" }), {
      ok: true,
      targets: [
        { month: "2026-10-01", target: 10 },
        { month: "2026-11-01", target: 20 },
      ],
    })
    assert.equal(targetsFromDraft({ "2026-10-01": "-1" }).ok, false)
    assert.equal(targetsFromDraft({ "2026-10-01": "abc" }).ok, false)
  })

  it("parses a targets request and refuses one without a KPI id", () => {
    const parsed = parseKpiRequest({ action: "targets", kpiId: KPI_ID, targets: [{ month: "2026-10-01", target: 5 }] })
    assert.equal(parsed.ok, true)
    assert.equal(parseKpiRequest({ action: "targets", targets: [] }).ok, false)
    assert.equal(parseKpiRequest({ action: "deactivate", kpiId: "nope" }).ok, false)
  })

  it("shows this month's target and status, and none for a deactivated KPI", () => {
    const base: WebKpi = {
      id: KPI_ID,
      clientId: 7,
      label: "Clicks",
      source: "gsc_metric",
      eventNames: null,
      metric: "clicks",
      active: true,
      sortOrder: 0,
      targets: [{ month: "2026-10-01", target: 310 }],
    }
    const rows = kpiEditorRows(
      [base, { ...base, id: OTHER_ID, active: false }],
      [{ kpiId: KPI_ID, total: 100, months: [{ month: "2026-10-01", actual: 100 }] }],
      "2026-10-10",
    )
    assert.equal(rows[0].monthTarget, 310)
    assert.equal(rows[0].monthActual, 100)
    assert.equal(rows[0].monthStatus, "on-track")
    assert.equal(rows[1].monthActual, null)
    assert.equal(rows[1].monthStatus, "no-data")
  })
})

describe("saved KPI tile", () => {
  it("shows the full window actual and paces only the targeted months", () => {
    const data = report([
      item({
        targets: [{ month: "2026-10-01", target: 310 }],
        window: {
          total: 400,
          months: [
            { month: "2026-09-01", actual: 250 },
            { month: "2026-10-01", actual: 150 },
          ],
        },
      }),
    ])
    const prepared = tiles(data, [KPI_ID])
    assert.equal(prepared.kind, "tiles")
    if (prepared.kind !== "tiles") return
    const [tile] = prepared.tiles
    assert.equal(tile.value, "400")
    assert.equal(tile.current, 400)
    // Oct 1-15 of a 310 target is 150 to date; 150 actual is on track.
    assert.equal(tile.target, 150)
    assert.deepEqual(tile.bullet, { measure: 150, target: 150 })
    assert.equal(tile.status, "on-track")
    assert.equal(tile.progress, 1)
    assert.equal(tile.caption, "Target covers Oct only")
  })

  it("pro-rates a part month and paces to today", () => {
    const window = { from: "2026-10-01", to: "2026-10-31" }
    const data = report(
      [
        item({
          targets: [{ month: "2026-10-01", target: 310 }],
          window: { total: 50, months: [{ month: "2026-10-01", actual: 50 }] },
        }),
      ],
      window,
      "2026-10-10",
    )
    const prepared = tiles(data, [KPI_ID])
    if (prepared.kind !== "tiles") return assert.fail("expected tiles")
    const [tile] = prepared.tiles
    assert.equal(tile.value, "50")
    assert.equal(tile.target, 310)
    // 10 of 31 days elapsed: 100 expected, 50 actual is behind.
    assert.equal(tile.progress, 0.5)
    assert.equal(tile.status, "behind")
    assert.equal(tile.caption, undefined, "a fully covered window has no coverage note")
  })

  it("reads No target when no month in the window has one", () => {
    const prepared = tiles(report([item({ window: { total: 12, months: [{ month: "2026-10-01", actual: 12 }] } })]), [KPI_ID])
    if (prepared.kind !== "tiles") return assert.fail("expected tiles")
    assert.equal(prepared.tiles[0].caption, "No target")
    assert.equal(prepared.tiles[0].status, undefined)
  })

  it("draws the bullet from targeted months only", () => {
    const data = report([
      item({
        targets: [{ month: "2026-10-01", target: 310 }],
        window: {
          total: 400,
          months: [
            { month: "2026-09-01", actual: 250 },
            { month: "2026-10-01", actual: 150 },
          ],
        },
      }),
    ])
    const prepared = tiles(data, [KPI_ID], "bullet")
    if (prepared.kind !== "bullet") return assert.fail("expected bullet")
    assert.equal(prepared.rows.length, 1)
    assert.equal(prepared.rows[0].measure, prepared.rows[0].target)
  })

  it("hides a deactivated KPI", () => {
    const active = item({ id: OTHER_ID, label: "Calls" })
    const built = buildKpiReportItems(
      [
        { id: KPI_ID, clientId: 7, label: "Old", source: "ga4_event", eventNames: ["a"], metric: null, active: false, sortOrder: 0, targets: [] },
        { id: OTHER_ID, clientId: 7, label: "Calls", source: "ga4_event", eventNames: ["b"], metric: null, active: true, sortOrder: 1, targets: [] },
      ],
      [],
      [],
    )
    assert.deepEqual(built.map((row) => row.id), [OTHER_ID])
    const prepared = tiles(report([active]), [KPI_ID, OTHER_ID])
    if (prepared.kind !== "tiles") return assert.fail("expected tiles")
    assert.deepEqual(prepared.tiles.map((tile) => tile.label), ["Calls"])
    const none = tiles(report([active]), [KPI_ID])
    assert.equal(none.kind, "message")
  })

  it("names a partial coverage across several months", () => {
    assert.equal(
      coverageNote({ monthsWithoutTarget: ["2026-08-01"] }, { from: "2026-08-01", to: "2026-10-31" }),
      "Target covers Sep and Oct only",
    )
    assert.equal(coverageNote({ monthsWithoutTarget: [] }, { from: "2026-08-01", to: "2026-10-31" }), null)
  })
})

describe("KPI tracker", () => {
  const window = { from: "2026-10-01", to: "2026-10-31" }
  const months = trackerMonthList(window)
  const tracked = item({
    targets: [
      { month: "2026-08-01", target: 100 },
      { month: "2026-09-01", target: 200 },
    ],
    tracker: {
      total: 470,
      months: [
        { month: "2026-08-01", actual: 120 },
        { month: "2026-09-01", actual: 150 },
        { month: "2026-10-01", actual: 200 },
      ],
    },
  })

  it("spans the 12 months up to the window's end", () => {
    assert.equal(months.length, 12)
    assert.equal(months[0], "2025-11-01")
    assert.equal(months[11], "2026-10-01")
  })

  it("gives variance as actual minus target, and No target months keep the actual", () => {
    const rows = kpiTrackerRows(tracked, months, 3, window.to, "2026-10-31")
    assert.deepEqual(
      rows.map((row) => [row.month, row.actual, row.target, row.variance, row.status]),
      [
        ["2026-08-01", 120, 100, 20, "ahead"],
        ["2026-09-01", 150, 200, -50, "behind"],
        ["2026-10-01", 200, null, null, "no-data"],
      ],
    )
  })

  it("renders the table with No target, and the combo on one axis", () => {
    const data = report([tracked], window, "2026-10-31")
    const table = prepareWebElement({ elementId: "kpiTracker", settings: { kpiIds: [KPI_ID], months: "6" }, display: "table" }, data)
    if (table.kind !== "table") return assert.fail("expected table")
    assert.deepEqual(table.headers, ["Month", "Target", "Actual", "Variance", "Status"])
    assert.equal(table.rows.length, 6)
    assert.deepEqual(table.rows[3].cells.map((cell) => cell.text), ["Aug 26", "100", "120", "+20", "Ahead"])
    assert.deepEqual(table.rows[5].cells.map((cell) => cell.text), ["Oct 26", "No target", "200", "—", "No target"])

    const combo = prepareWebElement({ elementId: "kpiTracker", settings: { kpiIds: [KPI_ID], months: "12" }, display: "combo" }, data)
    if (combo.kind !== "series") return assert.fail("expected series")
    assert.equal(combo.display, "combo")
    assert.equal(combo.sharedAxis, true)
    assert.equal(combo.data.length, 12)
    assert.equal(combo.data[11].actual0, 200)
    assert.equal("target0" in combo.data[11], false)
    assert.match(combo.note ?? "", /No target/)
  })

  it("leaves out a deactivated KPI and asks for one when none is left", () => {
    const data = report([], window, "2026-10-31")
    const prepared = prepareWebElement({ elementId: "kpiTracker", settings: { kpiIds: [KPI_ID], months: "12" }, display: "combo" }, data)
    assert.equal(prepared.kind, "message")
  })

  it("validates tracker settings and needs a KPI for a saved KPI tile", () => {
    assert.equal(elementSettings.kpiTracker.safeParse({ kpiIds: [KPI_ID], months: "6" }).success, true)
    assert.equal(elementSettings.kpiTracker.safeParse({ kpiIds: [KPI_ID], months: "3" }).success, false)
    assert.equal(elementSettings.kpis.safeParse({ tiles: [{ kind: "savedKpi" }] }).success, false)
    assert.equal(elementSettings.kpis.safeParse({ tiles: [{ kind: "savedKpi", kpiId: KPI_ID }] }).success, true)
  })
})
