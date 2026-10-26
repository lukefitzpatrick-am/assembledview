import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildGa4Slice } from "@/lib/webReport/aggregate"
import { prepareWebElement } from "@/lib/webReport/displayModel"
import { emptyTotals, type WebReportData } from "@/lib/webReport/types"

const current = { from: "2026-09-29", to: "2026-10-26" }
const previous = { from: "2026-09-01", to: "2026-09-28" }

function ga4() {
  return buildGa4Slice({
    connected: true,
    today: "2026-10-26",
    current,
    previous,
    maxDate: "2026-10-26",
    campaign: [],
    landing: [],
    sourceMedium: [
      { date: "2026-10-01", source: "google", medium: "cpc", sessions: 120, engagedSessions: 60, keyEvents: 12, totalUsers: 100 },
      { date: "2026-09-10", source: "google", medium: "cpc", sessions: 100, engagedSessions: 40, keyEvents: 10, totalUsers: 80 },
      { date: "2026-10-02", source: "bing", medium: "cpc", sessions: 10, engagedSessions: 5, keyEvents: 0, totalUsers: 9 },
    ],
    events: [],
    pageTitles: [
      { date: "2026-10-03", pageTitle: "Home", users: 50, newUsers: 10, keyEvents: 5, pageViews: 90 },
      { date: "2026-09-03", pageTitle: "Home", users: 40, newUsers: 8, keyEvents: 4, pageViews: 60 },
      { date: "2026-10-04", pageTitle: "New page", users: 5, newUsers: 5, keyEvents: 0, pageViews: 7 },
    ],
  })
}

function report(): WebReportData {
  return {
    windows: { period: "last_28_days", current, previous, phrase: "Last 28 days", comparedWith: "Previous 28 days" },
    ga4Property: "372647707",
    gscSite: null,
    ga4: ga4(),
    gsc: { status: "not_connected", maxDate: null, message: null, current: emptyTotals(), previous: emptyTotals(), daily: [], queries: [], pages: [], pagesStatus: "not_connected" },
    paid: { status: "ok", message: null, spend: null, previousSpend: null, byChannel: [] },
  }
}

function table(elementId: "srcmed" | "pages", settings: unknown) {
  const model = prepareWebElement({ elementId, settings }, report())
  assert.equal(model.kind, "table")
  return model.kind === "table" ? model : null
}

describe("% change columns on tables", () => {
  it("keeps the saved source / medium table as it was when compare is absent", () => {
    const model = table("srcmed", { topN: 10, columns: ["sessions", "keyEvents"], showChange: true, shade: true })
    assert.deepEqual(model?.headers, ["Source / medium", "Sessions", "Key events"])
    assert.equal(model?.note, undefined)
  })

  it("adds a % change column after each source / medium column, with users", () => {
    const model = table("srcmed", { topN: 10, columns: ["users", "sessions", "engagementRate", "keyEvents"], showChange: false, shade: false, compare: true })
    assert.deepEqual(model?.headers, [
      "Source / medium",
      "Users (sum of daily)", "% Δ", "Sessions", "% Δ", "Engagement rate", "% Δ", "Key events", "% Δ",
    ])
    assert.deepEqual(model?.rows[0].cells.map((cell) => cell.text), [
      "google / cpc", "100", "+25.0%", "120", "+20.0%", "50.0%", "+25.0%", "12", "+20.0%",
    ])
    assert.deepEqual(model?.rows[1].cells.map((cell) => cell.text).slice(1, 3), ["9", "—"])
  })

  it("adds % change to page title rows and a dash for new pages", () => {
    const model = table("pages", { topN: 10, compare: true })
    assert.deepEqual(model?.headers, ["Page title", "Page views", "% Δ", "Users", "% Δ", "Key events", "% Δ"])
    assert.deepEqual(model?.rows.map((row) => row.cells.map((cell) => cell.text)), [
      ["Home", "90", "+50.0%", "50", "+25.0%", "5", "+25.0%"],
      ["New page", "7", "—", "5", "—", "0", "—"],
    ])
    const plain = table("pages", { topN: 10 })
    assert.deepEqual(plain?.headers, ["Page title", "Page views", "Users", "Key events"])
  })
})
