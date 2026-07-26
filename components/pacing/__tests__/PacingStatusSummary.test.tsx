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

const GOLDEN =
  `<div class="grid grid-cols-2 gap-2 rounded-card border border-border bg-card p-3 shadow-e0 sm:grid-cols-3 lg:grid-cols-6"><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">Behind</span><span class="num text-lg font-semibold text-status-behind-fg">2</span></div><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">On track</span><span class="num text-lg font-semibold text-status-on-track-fg">5</span></div><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">Ahead</span><span class="num text-lg font-semibold text-status-ahead-fg">1</span></div><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">Over-pacing</span><span class="num text-lg font-semibold text-status-critical-fg">3</span></div><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">No data</span><span class="num text-lg font-semibold text-muted-foreground">4</span></div><div class="flex flex-col"><span class="text-[10px] uppercase tracking-wide text-muted-foreground">KPI Pending</span><span class="num text-lg font-semibold text-muted-foreground">0</span></div></div>`

describe("PacingStatusSummary", () => {
  it("matches Overview counts-row markup for fixed counts", () => {
    const html = renderToStaticMarkup(<PacingStatusSummary counts={SAMPLE} />)
    expect(html).toBe(GOLDEN)
  })
})
