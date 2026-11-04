/** @vitest-environment jsdom */
/**
 * C-159: system charts take explicit percent units. `percent` is a ratio
 * (1 = 100%); gauge, radial bars and scatter `percentPoints` take 0–100 points.
 */
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    // jsdom has no layout: give the chart a fixed size so axes and labels render.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 400,
        height: 300,
      }),
  }
})

import { BarChart, GaugeChart, LineChart, RadialBarsChart, ScatterChart } from "../index"
import { percentPointsLabel, radialBarRows } from "../composition-charts"
import { fmt } from "@/lib/chart-theme"

function texts(html: string): string[] {
  return [...html.matchAll(/<(?:text|tspan)[^>]*>([^<]+)<\/(?:text|tspan)>/g)].map((match) => match[1] ?? "")
}

function percentTicks(html: string): string[] {
  return texts(html).filter((text) => text.endsWith("%"))
}

describe("fmt", () => {
  it("percent is a ratio and percentPoints is points", () => {
    expect(fmt.percent(0.73)).toBe("73%")
    expect(fmt.percent(1.2)).toBe("120%")
    expect(fmt.percent(73)).toBe("7300%")
    expect(fmt.percentPoints(73)).toBe("73%")
    expect(fmt.percentPoints(3.5, 1)).toBe("3.5%")
  })

  it("percentPoints gives the same text as the scatter's old percent(n / 100)", () => {
    for (const points of [0, 0.5, 1, 1.005, 2.5, 3.5, 14.5, 33.333, 60.5, 99.95, 100, 250]) {
      for (const dp of [0, 1, 2]) {
        expect(fmt.percentPoints(points, dp)).toBe(fmt.percent(points / 100, dp))
      }
    }
  })
})

describe("GaugeChart and RadialBarsChart take points", () => {
  it("gauge: 0.5 points renders 0.5%, 73 renders 73%", () => {
    expect(texts(renderToStaticMarkup(<GaugeChart value={0.5} />))).toContain("0.5%")
    expect(texts(renderToStaticMarkup(<GaugeChart value={73} />))).toContain("73%")
    expect(texts(renderToStaticMarkup(<GaugeChart value={1} />))).toContain("1.0%")
    expect(texts(renderToStaticMarkup(<GaugeChart value={100} />))).toContain("100%")
    // The old guess drew 0.5 as 50% and 1 as 100%.
    expect(texts(renderToStaticMarkup(<GaugeChart value={0.5} />))).not.toContain("50%")
  })

  it("radial bars keep points as given, and label them as points", () => {
    const rows = radialBarRows([
      { label: "Low", value: 0.5 },
      { label: "Typical", value: 73 },
      { label: "One", value: 1 },
    ])
    expect(rows.map((row) => row.value)).toEqual([0.5, 73, 1])
    expect(percentPointsLabel(0.5)).toBe("0.5%")
    expect(percentPointsLabel(73)).toBe("73%")
    expect(percentPointsLabel(9.95)).toBe("9.9%")
    expect(percentPointsLabel(10)).toBe("10%")
    const html = renderToStaticMarkup(
      <RadialBarsChart data={[{ label: "Low", value: 0.5 }, { label: "Typical", value: 73 }]} />,
    )
    expect(html).toContain("recharts-radial-bar")
  })
})

describe("ScatterChart percentPoints", () => {
  it("formats points with no division guess", () => {
    const html = renderToStaticMarkup(
      <ScatterChart data={[{ x: 1, y: 3.5 }, { x: 2, y: 7 }]} yFormat="percentPoints" xFormat="number" />,
    )
    const ticks = percentTicks(html)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks).toContain("0%")
    // 3.5 to 7 points: ticks stay in points, never multiplied up.
    for (const text of ticks) expect(Number.parseFloat(text)).toBeLessThanOrEqual(10)
  })
})

describe("bar and line charts: percent is a ratio", () => {
  const data = [
    { day: "Mon", rate: 0.6 },
    { day: "Tue", rate: 1.2 },
  ]

  it("BarChart shows 1.2 as 120%", () => {
    const html = renderToStaticMarkup(
      <BarChart data={data} xKey="day" series={[{ key: "rate", label: "Rate" }]} valueFormat="percent" />,
    )
    const ticks = percentTicks(html)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.some((text) => Number.parseFloat(text) >= 120)).toBe(true)
  })

  it("LineChart shows 1.2 as 120%", () => {
    const html = renderToStaticMarkup(
      <LineChart data={data} xKey="day" series={[{ key: "rate", label: "Rate" }]} valueFormat="percent" />,
    )
    const ticks = percentTicks(html)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.some((text) => Number.parseFloat(text) >= 120)).toBe(true)
  })
})
