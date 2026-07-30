/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PacingStatusSummary } from "@/components/pacing/PacingStatusSummary"
import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"

const SAMPLE: OverviewStatusCounts = {
  behind: 2,
  onTrack: 5,
  ahead: 1,
  overPacing: 3,
  noData: 4,
  kpiPending: 0,
}

describe("PacingStatusSummary", () => {
  it("renders six tile labels from pacingStatus vocabulary plus StatusLegend", () => {
    const html = renderToStaticMarkup(<PacingStatusSummary counts={SAMPLE} />)
    expect(html).toContain("Behind")
    expect(html).toContain("On track")
    expect(html).toContain("Ahead")
    expect(html).toContain("Over-pacing")
    expect(html).toContain("No data")
    expect(html).toContain("KPI Pending")
    expect(html).toContain('aria-label="Pacing status definitions"')
    expect(html).toContain("Status legend")
    // Ahead is attention (not success green); no-data is problem (critical).
    expect(html).toContain("text-status-attention-fg")
    expect(html).toContain("text-status-critical-fg")
    expect(html).toContain("±5%")
    expect(html).toContain("≥15%")
  })
})
