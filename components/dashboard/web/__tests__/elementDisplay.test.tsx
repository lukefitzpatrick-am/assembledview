/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { ElementDisplay } from "@/components/dashboard/web/displays/ElementDisplay"
import { prepareWebElement } from "@/lib/webReport/displayModel"
import { emptyTotals, type WebReportData } from "@/lib/webReport/types"

function report(): WebReportData {
  return {
    windows: {
      period: "last_month",
      current: { from: "2026-09-01", to: "2026-09-30" },
      previous: { from: "2026-08-01", to: "2026-08-31" },
      phrase: "September 2026",
      comparedWith: "August 2026",
    },
    ga4Property: null,
    gscSite: null,
    ga4: {
      status: "ok",
      maxDate: null,
      message: null,
      pageViewsSource: null,
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [{ date: "2026-09-01", sessions: 3, pageViews: 4, keyEvents: 1, clicks: null, impressions: null }],
      sourceMedium: [{ source: "google", medium: "organic", sessions: 3, keyEvents: 1, engagementRate: 0.5, previousSessions: 1 }],
      sourceMediumStatus: "ok",
      pages: [],
      landing: [],
      keyEventsByName: [],
      cities: [],
    },
    gsc: {
      status: "not_connected",
      maxDate: null,
      message: null,
      current: emptyTotals(),
      previous: emptyTotals(),
      daily: [],
      queries: [],
      pages: [],
      pagesStatus: "needs_report",
    },
    paid: { status: "ok", message: null, spend: null, previousSpend: null, byChannel: [] },
  }
}

describe("web element display", () => {
  it("renders notes, a sessions donut, and a not-connected search card", () => {
    const notes = renderToStaticMarkup(
      <ElementDisplay model={prepareWebElement({ elementId: "notes", settings: { text: "Bring the printout." } }, report())} />,
    )
    expect(notes).toContain("Bring the printout.")
    expect(notes).toContain("Notes")

    const donut = renderToStaticMarkup(
      <ElementDisplay model={prepareWebElement({
        elementId: "srcmed",
        settings: { topN: 10, columns: ["sessions"], showChange: false, shade: true },
        display: "donut",
      }, report())} />,
    )
    expect(donut).toContain("Source / medium")
    expect(donut).toContain("Share of sessions")
    expect(donut).not.toContain("99")

    const search = renderToStaticMarkup(
      <ElementDisplay model={prepareWebElement({
        elementId: "gscKpi",
        settings: { tiles: ["clicks"] },
      }, report())} />,
    )
    expect(search).toContain("Not connected yet")
  })
})
