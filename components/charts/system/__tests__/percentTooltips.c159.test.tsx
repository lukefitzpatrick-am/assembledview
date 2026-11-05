/** @vitest-environment jsdom */
/**
 * C-159 follow-up (B26, B25 review L-1): the rendered tooltips format percent
 * the way the contract says.
 *
 * - Delivery chart: a `percent` series (a ratio) shows 2 dp in the tooltip
 *   (`DELIVERY_PERCENT_TOOLTIP_DP`), counts stay whole.
 * - DonutChart `percent` (the default): a ratio, 0.38 → "38%".
 * - RadialBarsChart: points, 73 → "73%", 0.5 → "0.5%".
 *
 * jsdom has no mouse position, so recharts never fills the tooltip on its
 * own. The recharts `Tooltip` is swapped for one that renders the chart's own
 * `content` element active, with the payload set by each test. recharts
 * still finds it by its display name, so the chart wires it as usual.
 */
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const tip = vi.hoisted(() => ({ label: "", payload: [] as unknown[] }))

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  function Tooltip({ content }: { content?: React.ReactNode }) {
    if (!React.isValidElement(content)) return null
    return React.cloneElement(content as React.ReactElement<Record<string, unknown>>, {
      active: true,
      label: tip.label,
      payload: tip.payload,
    })
  }
  Tooltip.displayName = "Tooltip"
  return {
    ...actual,
    Tooltip,
    // jsdom has no layout: give the chart a fixed size so it renders.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 400,
        height: 300,
      }),
  }
})

import { DonutChart, RadialBarsChart } from "../index"
import { DeliveryDailyChart, type DeliveryDailyChartSeries } from "@/components/dashboard/delivery/common/DeliveryDailyChart"

/** Text of the HTML tooltip (outside the SVG). */
function tooltipText(html: string): string {
  const htmlOnly = html.replace(/<svg[\s\S]*?<\/svg>/g, "")
  return htmlOnly.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("DeliveryDailyChart tooltip", () => {
  const SERIES: DeliveryDailyChartSeries[] = [
    { key: "impressions", label: "Impressions", yAxis: "left", format: "number" },
    { key: "completionRate", label: "Completion rate", yAxis: "right", format: "percent" },
  ]

  it("shows a percent series (a ratio) to 2 dp and counts as before (compact)", () => {
    tip.label = "1 Apr"
    tip.payload = [
      { dataKey: "impressions", value: 1000 },
      { dataKey: "completionRate", value: 0.605 },
    ]
    const html = renderToStaticMarkup(
      <DeliveryDailyChart
        asAtDate="2026-04-02"
        daily={[
          { date: "2026-04-01", impressions: 1000, completionRate: 0.605 },
          { date: "2026-04-02", impressions: 2000, completionRate: 0.6 },
        ]}
        series={SERIES}
      />,
    )
    const text = tooltipText(html)
    expect(text).toContain("Completion rate 60.50%")
    expect(text).toContain("Impressions 1K")
  })

  it("keeps 2 dp for a low rate and a rate above 100%", () => {
    for (const [ratio, shown] of [
      [0.006, "0.60%"],
      [1.2, "120.00%"],
    ] as const) {
      tip.label = "1 Apr"
      tip.payload = [{ dataKey: "completionRate", value: ratio }]
      const html = renderToStaticMarkup(
        <DeliveryDailyChart
          asAtDate="2026-04-01"
          daily={[{ date: "2026-04-01", impressions: 1000, completionRate: ratio }]}
          series={SERIES}
        />,
      )
      expect(tooltipText(html)).toContain(`Completion rate ${shown}`)
    }
  })
})

describe("DonutChart tooltip", () => {
  it("percent (the default) reads values as ratios", () => {
    tip.label = ""
    tip.payload = [
      { name: "Search", value: 0.38, dataKey: "value", payload: { label: "Search", value: 0.38, fill: "var(--av-chart-1)" } },
    ]
    const html = renderToStaticMarkup(
      <DonutChart data={[{ label: "Search", value: 0.38 }, { label: "Social", value: 0.62 }]} />,
    )
    const text = tooltipText(html)
    expect(text).toContain("38%")
    // A points reading (0.38 / 100) would show 0%.
    expect(text).not.toMatch(/(^|\s)0%/)
  })
})

describe("RadialBarsChart tooltip", () => {
  it("labels points as points, 1 dp under 10", () => {
    for (const [points, shown] of [
      [73, "73%"],
      [0.5, "0.5%"],
    ] as const) {
      tip.label = ""
      tip.payload = [
        { name: "Typical", value: points, dataKey: "value", payload: { name: "Typical", value: points, fill: "var(--av-chart-1)" } },
      ]
      const html = renderToStaticMarkup(<RadialBarsChart data={[{ label: "Typical", value: points }]} />)
      const text = tooltipText(html)
      expect(text).toContain(shown)
      // A ratio reading (fmt.percent) would show 7300% or 50%.
      expect(text).not.toContain("7300%")
      expect(text).not.toContain("50%")
    }
  })
})
