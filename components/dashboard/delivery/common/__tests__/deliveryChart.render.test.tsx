/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { DeliveryDailyChart } from "../DeliveryDailyChart"
import { formatDateShort } from "@/lib/format/date"
import {
  DELIVERY_CHART_CHANNEL_HEIGHT_CLASS,
  DELIVERY_CHART_COLOUR,
  DELIVERY_CHART_LINE_HEIGHT_CLASS,
  blankFutureDays,
  deliveryAxisShowsMonth,
  deliveryAxisTick,
  deliveryChartEmptyCopy,
  formatDeliveryValue,
  paintSeries,
} from "../deliveryChartSpec"

describe("delivery chart spec", () => {
  it("formats money with currency compact and counts with compact", () => {
    expect(formatDeliveryValue("dollars", 48210)).toMatch(/^\$/)
    expect(formatDeliveryValue("compact", 48210)).not.toMatch(/,/)
    expect(formatDeliveryValue("percent", 0.73)).toBe("73%")
    expect(formatDeliveryValue("percent", 73)).toBe("73%")
  })

  it("blanks days after as-at and keeps earlier days", () => {
    const rows = blankFutureDays(
      [
        { date: "2026-04-01", amount_spent: 10, impressions: 100 },
        { date: "2026-04-03", amount_spent: 20, impressions: 200 },
      ],
      "2026-04-01",
      ["amount_spent", "impressions"],
    )
    expect(rows[0]?.amount_spent).toBe(10)
    expect(rows[1]?.amount_spent).toBeNull()
    expect(rows[1]?.impressions).toBeNull()
    expect(rows[1]?.date).toBe("2026-04-03")
  })

  it("puts the month on the first day of each month and the day number under it", () => {
    const dates = ["2026-04-01", "2026-04-02", "2026-05-01"]
    expect(deliveryAxisShowsMonth(dates, 0)).toBe(true)
    expect(deliveryAxisShowsMonth(dates, 1)).toBe(false)
    expect(deliveryAxisShowsMonth(dates, 2)).toBe(true)
    expect(deliveryAxisTick("2026-04-01", true)).toEqual({ month: "Apr", day: "1" })
    expect(deliveryAxisTick("2026-04-02", false).month).toBe("")
    expect(deliveryAxisTick("2026-04-02", false).day).toBe("2")
  })

  it("says Starts when the campaign has not begun, otherwise Awaiting first report", () => {
    expect(
      deliveryChartEmptyCopy({ startsOn: "2026-04-15", asAtDate: "2026-04-01", todayISO: "2026-04-01" }),
    ).toMatch(/^Starts /)
    expect(
      deliveryChartEmptyCopy({ startsOn: "2026-04-01", asAtDate: "2026-04-15", todayISO: "2026-04-15" }),
    ).toBe("Awaiting first report")
    expect(deliveryChartEmptyCopy({ empty: { kind: "awaiting-first-report" }, todayISO: "2026-04-01" })).toBe(
      "Awaiting first report",
    )
  })

  it("paints delivered as forest bars, planned as dashed sky, pace as lime, and the metric line as ink", () => {
    const paint = paintSeries([
      { key: "delivered", label: "Delivered", yAxis: "left", format: "dollars" },
      { key: "planned", label: "Planned", yAxis: "left", format: "dollars" },
      { key: "cumulativePace", label: "Cumulative pace", yAxis: "left", format: "dollars" },
      { key: "impressions", label: "Impressions", yAxis: "right", format: "number" },
    ])
    expect(paint.map((item) => [item.key, item.mark, item.colour])).toEqual([
      ["delivered", "bar", DELIVERY_CHART_COLOUR.delivered],
      ["planned", "dashed", DELIVERY_CHART_COLOUR.planned],
      ["cumulativePace", "line", DELIVERY_CHART_COLOUR.cumulativePace],
      ["impressions", "line", DELIVERY_CHART_COLOUR.metric],
    ])
  })
})

describe("DeliveryDailyChart", () => {
  it("draws the spec: forest bars, dashed planned, lime pace, today line, legend under the title", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart
        spec={{
          title: "Daily delivery",
          measure: "money",
          height: "channel",
          asAtDate: "2026-04-02",
          points: [
            { date: "2026-04-01", delivered: 10, planned: 12, cumulativePace: 10 },
            { date: "2026-04-02", delivered: 8, planned: 12, cumulativePace: 18 },
            { date: "2026-04-03", delivered: 9, planned: 12, cumulativePace: 27 },
          ],
        }}
        mediaTypeColour="var(--channel-tv)"
      />,
    )

    expect(html).toContain(DELIVERY_CHART_CHANNEL_HEIGHT_CLASS)
    expect(html).toContain('data-legend-position="under-title"')
    expect(html).toContain('data-axis-domain="0"')
    expect(html).toContain('data-series-key="delivered"')
    expect(html).toContain('data-series-mark="bar"')
    expect(html).toContain('data-series-format="currency-compact"')
    expect(html).toContain(`data-series-colour="${DELIVERY_CHART_COLOUR.delivered}"`)
    expect(html).toContain('data-series-key="planned"')
    expect(html).toContain('data-series-mark="dashed"')
    expect(html).toContain(`data-series-colour="${DELIVERY_CHART_COLOUR.planned}"`)
    expect(html).toContain('data-series-key="cumulativePace"')
    expect(html).toContain(`data-series-colour="${DELIVERY_CHART_COLOUR.cumulativePace}"`)
    expect(html).toContain('data-today-line="2026-04-02"')
    expect(html).toContain('data-future-blank-count="1"')
    expect(html).not.toContain("var(--channel-tv)")
  })

  it("uses the line height class when size is line", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart
        size="line"
        asAtDate="2026-04-01"
        daily={[{ date: "2026-04-01", amount_spent: 10, impressions: 100 }]}
        series={[
          { key: "amount_spent", label: "Spend", yAxis: "left" },
          { key: "impressions", label: "Impressions", yAxis: "right" },
        ]}
      />,
    )
    expect(html).toContain(DELIVERY_CHART_LINE_HEIGHT_CLASS)
    expect(html).not.toContain("sm:h-[240px]")
    expect(html).toContain('data-series-format="currency-compact"')
    expect(html).toContain('data-series-format="compact"')
    expect(html).not.toContain("Planned")
    expect(html).not.toContain("Cumulative pace")
  })

  it("shows Awaiting first report when nothing has been reported", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart daily={[]} series={[]} asAtDate="2026-04-15" startsOn="2026-04-01" />,
    )
    expect(html).toContain("Awaiting first report")
    expect(html).not.toContain("No daily delivery data available")
  })

  it("shows Starts and the date when the flight has not begun", () => {
    const html = renderToStaticMarkup(
      <DeliveryDailyChart daily={[]} series={[]} asAtDate="2026-04-01" startsOn="2026-04-15" />,
    )
    expect(html).toContain(`Starts ${formatDateShort("2026-04-15")}`)
  })
})
