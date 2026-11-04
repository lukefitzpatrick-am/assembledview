/** @vitest-environment jsdom */
/**
 * C-159: the delivery chart's `percent` series are ratios. Axis decimals,
 * the CSV export (percentage points) and the rendered axis ticks.
 */
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ChartExportSeriesInput } from "@/lib/charts/chartExport"
import { normalizeChartExportSeries } from "@/lib/charts/chartExport"

const exportInputs: ChartExportSeriesInput[] = []

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    // jsdom has no layout: give the chart a fixed size so axes render.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 480,
        height: 240,
      }),
  }
})

vi.mock("@/components/charts/system", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/charts/system")>()
  const Original = actual.BaseChartCard
  return {
    ...actual,
    BaseChartCard: (props: React.ComponentProps<typeof Original>) => {
      if (props.exportSeries) exportInputs.push(props.exportSeries)
      return <Original {...props} />
    },
  }
})

import { DeliveryDailyChart, type DeliveryDailyChartSeries } from "../DeliveryDailyChart"
import {
  DELIVERY_PERCENT_AXIS_FINE_BELOW,
  deliveryAxisDecimals,
  deliveryExportRows,
  paintSeries,
  percentAxisDecimals,
} from "../deliveryChartSpec"

const COMPLETION: DeliveryDailyChartSeries[] = [
  { key: "impressions", label: "Impressions", yAxis: "left", format: "number" },
  { key: "completionRate", label: "Completion rate", yAxis: "right", format: "percent" },
]

function tickTexts(html: string): string[] {
  return [...html.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1] ?? "")
}

describe("percent axis decimals", () => {
  it("gives 1 dp when the axis top is under 10%, otherwise 0 dp", () => {
    expect(DELIVERY_PERCENT_AXIS_FINE_BELOW).toBe(0.1)
    expect(percentAxisDecimals(0)).toBe(1)
    expect(percentAxisDecimals(0.006)).toBe(1)
    expect(percentAxisDecimals(0.0999)).toBe(1)
    expect(percentAxisDecimals(0.1)).toBe(0)
    expect(percentAxisDecimals(0.605)).toBe(0)
    expect(percentAxisDecimals(1.2)).toBe(0)
    expect(percentAxisDecimals(Number.NaN)).toBe(0)
  })

  it("reads the largest plotted percent value on that axis only", () => {
    const paint = paintSeries(COMPLETION)
    const low = [
      { date: "2026-04-01", impressions: 900_000, completionRate: 0.004 },
      { date: "2026-04-02", impressions: 800_000, completionRate: 0.08 },
      { date: "2026-04-03", impressions: null, completionRate: null },
    ]
    expect(deliveryAxisDecimals(low, paint, "right")).toBe(1)
    // The left axis is a count: never any decimals from this rule.
    expect(deliveryAxisDecimals(low, paint, "left")).toBe(0)
    const high = [...low, { date: "2026-04-04", impressions: 1, completionRate: 0.62 }]
    expect(deliveryAxisDecimals(high, paint, "right")).toBe(0)
  })
})

describe("delivery chart CSV export", () => {
  it("keeps completion in percentage points, with the same arithmetic as before", () => {
    const paint = paintSeries(COMPLETION)
    const rows = [
      { date: "2026-04-01", dateLabel: "1 Apr", impressions: 1000, completionRate: 605 / 1000 },
      { date: "2026-04-02", dateLabel: "2 Apr", impressions: 3, completionRate: 1 / 3 },
      { date: "2026-04-03", dateLabel: "3 Apr", impressions: 0, completionRate: 0 },
      { date: "2026-04-04", dateLabel: "4 Apr", impressions: 0, completionRate: null },
    ]
    const out = deliveryExportRows(rows, paint)
    // Before C-159 the adapter sent (completes / impressions) * 100 and the CSV wrote it raw.
    expect(out.map((row) => row.completionRate)).toEqual([(605 / 1000) * 100, (1 / 3) * 100, 0, null])
    expect(out[0]?.completionRate).toBeCloseTo(60.5, 10)
    expect(out.map((row) => row.impressions)).toEqual([1000, 3, 0, 0])
    expect(out.map((row) => row.dateLabel)).toEqual(["1 Apr", "2 Apr", "3 Apr", "4 Apr"])
    // The chart rows are not changed.
    expect(rows[0]?.completionRate).toBe(0.605)
  })

  it("leaves rows alone when no series is percent", () => {
    const paint = paintSeries([
      { key: "impressions", label: "Impressions", yAxis: "left", format: "number" },
      { key: "clicks", label: "Clicks", yAxis: "right", format: "number" },
    ])
    const rows = [{ date: "2026-04-01", impressions: 10, clicks: 0.5 }]
    expect(deliveryExportRows(rows, paint)).toEqual(rows)
  })

  it("is what the chart hands to the CSV button", () => {
    exportInputs.length = 0
    renderToStaticMarkup(
      <DeliveryDailyChart
        asAtDate="2026-04-02"
        daily={[
          { date: "2026-04-01", impressions: 1000, completionRate: 0.605 },
          { date: "2026-04-02", impressions: 2000, completionRate: 0.5 },
        ]}
        series={COMPLETION}
      />,
    )
    const input = exportInputs.at(-1)
    expect(input).toBeDefined()
    const csv = normalizeChartExportSeries(input as ChartExportSeriesInput)
    expect(csv?.columns).toEqual(["dateLabel", "impressions", "completionRate"])
    expect(csv?.rows.map((row) => row.completionRate)).toEqual([0.605 * 100, 50])
    expect(csv?.rows.map((row) => row.impressions)).toEqual([1000, 2000])
  })
})

describe("delivery chart percent axis ticks", () => {
  it("draws a low completion axis as ratios with 1 dp", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart
        asAtDate="2026-04-03"
        daily={[
          { date: "2026-04-01", impressions: 1000, completionRate: 0.002 },
          { date: "2026-04-02", impressions: 1000, completionRate: 0.006 },
          { date: "2026-04-03", impressions: 1000, completionRate: 0.008 },
        ]}
        series={COMPLETION}
      />,
    )
    const percentTicks = tickTexts(html).filter((text) => text.endsWith("%"))
    expect(percentTicks.length).toBeGreaterThan(1)
    for (const text of percentTicks) expect(text).toMatch(/^\d+\.\d%$/)
    expect(percentTicks).toContain("0.0%")
    // The old guess read 0.6 points as 60%: never a tick at or above 10% here.
    for (const text of percentTicks) expect(Number.parseFloat(text)).toBeLessThan(10)
  })

  it("draws a typical completion axis with 0 dp and a rate above 100% as such", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart
        asAtDate="2026-04-02"
        daily={[
          { date: "2026-04-01", impressions: 1000, completionRate: 0.6 },
          { date: "2026-04-02", impressions: 1000, completionRate: 1.2 },
        ]}
        series={COMPLETION}
      />,
    )
    const percentTicks = tickTexts(html).filter((text) => text.endsWith("%"))
    expect(percentTicks.length).toBeGreaterThan(1)
    for (const text of percentTicks) expect(text).toMatch(/^\d+%$/)
    expect(percentTicks.some((text) => Number.parseFloat(text) >= 120)).toBe(true)
  })
})
