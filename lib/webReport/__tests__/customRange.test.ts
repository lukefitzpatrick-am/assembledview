import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { builderRequestBody, entriesFromLayout } from "@/lib/webReport/builder/editor"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"
import { CUSTOM_TARGET_NOTE, prepareWebElement } from "@/lib/webReport/displayModel"
import {
  CUSTOM_RANGE_MAX_DAYS,
  customRangeWindows,
  daysInclusive,
  resolveReportWindows,
  sydneyToday,
  validateCustomRange,
} from "@/lib/webReport/periods"
import { emptyTotals, type WebReportData } from "@/lib/webReport/types"
import type { WebKpiReportItem } from "@/lib/webReport/kpis/report"

const TODAY = "2026-10-26"

describe("custom report range", () => {
  it("compares with the same number of days immediately before", () => {
    const windows = customRangeWindows("2026-10-01", "2026-10-25")
    assert.equal(windows.period, "custom")
    assert.deepEqual(windows.previous, { from: "2026-09-06", to: "2026-09-30" })
    assert.equal(daysInclusive(windows.previous.from, windows.previous.to), 25)
    assert.equal(windows.phrase, "1 Oct 2026 to 25 Oct 2026")
    assert.equal(windows.comparedWith, "6 Sep 2026 to 30 Sep 2026")
    assert.deepEqual(customRangeWindows("2026-03-01", "2026-03-01").previous, { from: "2026-02-28", to: "2026-02-28" })
  })

  it("keeps the presets as they were", () => {
    assert.deepEqual(resolveReportWindows("month_to_date_yoy", TODAY).previous, { from: "2025-10-01", to: "2025-10-26" })
    assert.deepEqual(resolveReportWindows("last_28_days", TODAY).current, { from: "2026-09-29", to: TODAY })
  })

  it("validates order, yesterday in Sydney, and two years at most", () => {
    assert.deepEqual(validateCustomRange("2026-10-01", "2026-10-25", TODAY), { ok: true })
    assert.equal(validateCustomRange("2026-10-10", "2026-10-09", TODAY).ok, false)
    assert.equal(validateCustomRange("2026-10-01", TODAY, TODAY).ok, false)
    assert.equal(validateCustomRange("2026-02-30", "2026-03-01", TODAY).ok, false)
    const longest = "2024-10-25"
    assert.equal(daysInclusive(longest, "2026-10-25"), CUSTOM_RANGE_MAX_DAYS)
    assert.deepEqual(validateCustomRange(longest, "2026-10-25", TODAY), { ok: true })
    assert.equal(validateCustomRange("2024-10-24", "2026-10-25", TODAY).ok, false)
  })

  it("reads today in Sydney, not UTC", () => {
    // 14:30 UTC on 25 Oct is 01:30 on 26 Oct in Sydney (AEDT).
    assert.equal(sydneyToday(new Date("2026-10-25T14:30:00Z")), "2026-10-26")
  })

  it("sends the range on preview only, and the save keeps the preset", () => {
    const entries = entriesFromLayout([{ elementId: "notes", settings: { text: "" } }])
    const range = { from: "2026-10-01", to: "2026-10-25" }
    const preview = builderRequestBody({ action: "preview", entries, brandTerms: [], period: "last_month", range })
    const parsed = parseBuilderRequest(preview)
    assert.ok(parsed.ok && parsed.action === "preview")
    if (parsed.ok && parsed.action === "preview") {
      assert.deepEqual(parsed.body.range, range)
      assert.equal(parsed.body.defaultPeriod, "last_month")
    }
    const save = builderRequestBody({ action: "save", entries, brandTerms: [], period: "last_month", range })
    assert.equal("from" in save, false)
    assert.equal(parseBuilderRequest({ ...preview, to: undefined }).ok, false)
  })

  it("notes the prorated target on saved KPI tiles over a custom range only", () => {
    const item = {
      id: "9e10df61-955c-41e4-a4b3-aecb946d160c",
      label: "Website Visitors",
      source: "ga4_metric",
      targets: [
        { month: "2026-09-01", target: 3000 },
        { month: "2026-10-01", target: 3100 },
      ],
      window: { total: 2000, months: [{ month: "2026-09-01", actual: 500 }, { month: "2026-10-01", actual: 1500 }] },
      tracker: { total: null, months: [] },
    } as unknown as WebKpiReportItem
    const data = (windows: WebReportData["windows"]): WebReportData => ({
      windows,
      ga4Property: "1",
      gscSite: null,
      ga4: {
        status: "ok", maxDate: "2026-10-25", message: null, pageViewsSource: null, current: emptyTotals(), previous: emptyTotals(),
        daily: [], sourceMedium: [], sourceMediumStatus: "ok", pages: [], landing: [], keyEventsByName: [], cities: [],
      },
      gsc: { status: "not_connected", maxDate: null, message: null, current: emptyTotals(), previous: emptyTotals(), daily: [], queries: [], pages: [], pagesStatus: "not_connected" },
      paid: { status: "ok", message: null, spend: null, previousSpend: null, byChannel: [] },
      kpis: { status: "ok", today: "2026-10-26", trackerMonths: [], items: [item] } as unknown as WebReportData["kpis"],
    })
    const layout = { elementId: "kpis" as const, settings: { tiles: [{ kind: "savedKpi", kpiId: item.id }] } }
    const custom = prepareWebElement(layout, data(customRangeWindows("2026-09-16", "2026-10-15")))
    assert.equal(custom.kind, "tiles")
    if (custom.kind === "tiles") {
      // 3000 x 15/30 + 3100 x 15/31 = 1500 + 1500
      assert.equal(custom.tiles[0].expected, "Target 3,000")
      assert.equal(custom.tiles[0].caption, CUSTOM_TARGET_NOTE)
    }
    const preset = prepareWebElement(layout, data(resolveReportWindows("last_month", TODAY)))
    if (preset.kind === "tiles") assert.equal(preset.tiles[0].caption, undefined)
  })
})
