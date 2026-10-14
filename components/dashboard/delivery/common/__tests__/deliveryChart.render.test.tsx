/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { DeliveryDailyChart, type DeliveryDailyChartSeries } from "../DeliveryDailyChart"
import { formatDateShort } from "@/lib/format/date"
import { ChannelSection } from "../../ChannelSection"
import type { ChannelKey, ChannelSectionData } from "../../channels/types"
import { LineItemBlock } from "../../shared/LineItemBlock"
import type { ProgressCardProps } from "../../shared/ProgressCard"
import {
  DELIVERY_CHART_CHANNEL_HEIGHT_CLASS,
  DELIVERY_CHART_COLOUR,
  DELIVERY_CHART_LINE_HEIGHT_CLASS,
  blankFutureDays,
  deliveryAxisPlan,
  deliveryAxisShowsMonth,
  deliveryAxisTick,
  deliveryChartEmptyCopy,
  formatDeliveryValue,
  paintSeries,
} from "../deliveryChartSpec"

function isoDays(start: string, count: number): string[] {
  const origin = Date.parse(`${start}T00:00:00Z`)
  return Array.from({ length: count }, (_, index) =>
    new Date(origin + index * 86_400_000).toISOString().slice(0, 10),
  )
}

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

  it("ticks Mondays on a 242-day window and labels the month under the first tick of each month", () => {
    const dates = isoDays("2026-04-08", 242)
    const plan = deliveryAxisPlan(dates)
    expect(plan.length).toBeGreaterThan(0)
    for (const tick of plan) {
      expect(new Date(`${tick.iso}T00:00:00Z`).getUTCDay()).toBe(1)
    }
    expect(plan[0]).toEqual({ iso: "2026-04-13", day: "13", month: "Apr" })
    const seen = new Set<string>()
    for (const tick of plan) {
      const monthKey = tick.iso.slice(0, 7)
      if (!seen.has(monthKey)) {
        expect(tick.month.length).toBeGreaterThan(0)
        seen.add(monthKey)
      } else {
        expect(tick.month).toBe("")
      }
    }
    const may = plan.find((tick) => tick.iso.startsWith("2026-05"))
    expect(may?.iso).toBe("2026-05-04")
    expect(may?.month).toBe("May")
    expect(may?.day).toBe("4")
  })

  it("ticks every third day on a 30-day window and labels the month under the first tick of each month", () => {
    const dates = isoDays("2026-04-08", 30)
    const plan = deliveryAxisPlan(dates)
    expect(plan.map((tick) => tick.iso)).toEqual([
      "2026-04-08",
      "2026-04-11",
      "2026-04-14",
      "2026-04-17",
      "2026-04-20",
      "2026-04-23",
      "2026-04-26",
      "2026-04-29",
      "2026-05-02",
      "2026-05-05",
    ])
    expect(plan[0]).toMatchObject({ day: "8", month: "Apr" })
    expect(plan[1]?.month).toBe("")
    expect(plan.find((tick) => tick.iso === "2026-05-02")).toMatchObject({ day: "2", month: "May" })
    expect(plan.find((tick) => tick.iso === "2026-05-05")?.month).toBe("")
    expect(plan.some((tick) => tick.iso === "2026-04-13")).toBe(false)
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

const PROGRESS: ProgressCardProps = {
  title: "Spend",
  value: "$1",
  detail: "Delivered",
  progress: 0.5,
  variance: 0,
  status: "on-track",
}

const SPEND_IMPRESSIONS: DeliveryDailyChartSeries[] = [
  { key: "amount_spent", label: "Spend", yAxis: "left" },
  { key: "impressions", label: "Impressions", yAxis: "right" },
]

const COST_CLICKS: DeliveryDailyChartSeries[] = [
  { key: "cost", label: "Cost", yAxis: "left" },
  { key: "clicks", label: "Clicks", yAxis: "right" },
]

const SPEND_VIEWS: DeliveryDailyChartSeries[] = [
  { key: "amount_spent", label: "Spend", yAxis: "left" },
  { key: "video_3s_views", label: "Views", yAxis: "right" },
]

const IMPRESSIONS_CLICKS: DeliveryDailyChartSeries[] = [
  { key: "impressions", label: "Impressions", yAxis: "left", format: "number" },
  { key: "clicks", label: "Clicks", yAxis: "right", format: "number" },
]

const IMPRESSIONS_COMPLETION: DeliveryDailyChartSeries[] = [
  { key: "impressions", label: "Impressions", yAxis: "left", format: "number" },
  { key: "completionRate", label: "Completion rate", yAxis: "right", format: "percent" },
]

const CONTAINERS: Array<{
  key: ChannelKey
  title: string
  series: DeliveryDailyChartSeries[]
  leftFormat: string
  rightFormat: string
}> = [
  { key: "social-meta", title: "Meta", series: SPEND_IMPRESSIONS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "social-tiktok", title: "TikTok", series: SPEND_IMPRESSIONS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "social-reddit", title: "Reddit", series: SPEND_IMPRESSIONS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "search", title: "Search", series: COST_CLICKS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "programmatic-display", title: "Programmatic Display", series: SPEND_IMPRESSIONS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "programmatic-video", title: "Programmatic Video", series: SPEND_VIEWS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "programmatic-ooh", title: "Programmatic OOH", series: SPEND_VIEWS, leftFormat: "currency-compact", rightFormat: "compact" },
  { key: "digital-display", title: "Display", series: IMPRESSIONS_CLICKS, leftFormat: "compact", rightFormat: "compact" },
  { key: "digital-audio", title: "Audio", series: IMPRESSIONS_CLICKS, leftFormat: "compact", rightFormat: "compact" },
  { key: "bvod", title: "BVOD", series: IMPRESSIONS_CLICKS, leftFormat: "compact", rightFormat: "compact" },
  { key: "digital-video", title: "Video", series: IMPRESSIONS_COMPLETION, leftFormat: "compact", rightFormat: "percent" },
]

function channelSection(input: {
  key: ChannelKey
  title: string
  series: DeliveryDailyChartSeries[]
  startISO: string
  daily: Array<Record<string, string | number>>
}): ChannelSectionData {
  return {
    key: input.key,
    title: input.title,
    dateRange: { startISO: input.startISO, endISO: "2026-04-30" },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "var(--channel-sentinel)",
    aggregate: {
      summaryChips: [],
      progressCards: [PROGRESS, PROGRESS],
      kpiBand: { tiles: [] },
      chart: {
        daily: input.daily,
        series: input.series,
        asAtDate: "2026-04-02",
      },
    },
    lineItems: [],
  }
}

describe("delivery containers", () => {
  it.each(CONTAINERS)("$title uses the shared chart chrome", (container) => {
    const daily = [
      {
        date: "2026-04-01",
        ...Object.fromEntries(container.series.map((series) => [series.key, 10])),
      },
    ]
    const html = renderToStaticMarkup(
      <ChannelSection
        defaultOpen
        data={channelSection({
          key: container.key,
          title: container.title,
          series: container.series,
          startISO: "2026-04-01",
          daily,
        })}
      />,
    )

    expect(html).toContain(DELIVERY_CHART_CHANNEL_HEIGHT_CLASS)
    expect(html).toContain('data-legend-position="under-title"')
    expect(html).toContain('data-axis-domain="0"')
    expect(html).toContain(`data-series-colour="${DELIVERY_CHART_COLOUR.delivered}"`)
    expect(html).toContain(`data-series-format="${container.leftFormat}"`)
    expect(html).toContain(`data-series-format="${container.rightFormat}"`)
    expect(html).not.toContain('data-series-key="planned"')
    expect(html).not.toContain('data-series-key="cumulativePace"')
    expect(html).not.toContain("var(--channel-sentinel)")
  })

  it("renders a line chart with the same component at the small size", () => {
    const html = renderToStaticMarkup(
      <LineItemBlock
        name="Line A"
        startsOn="2026-04-01"
        progressCards={[PROGRESS, { ...PROGRESS, title: "Impressions" }]}
        kpiBand={{ tiles: [] }}
        chart={{
          kind: "daily-delivery",
          daily: [{ date: "2026-04-01", amount_spent: 10, impressions: 100 }],
          series: SPEND_IMPRESSIONS,
          asAtDate: "2026-04-02",
        }}
      />,
    )
    expect(html).toContain(DELIVERY_CHART_LINE_HEIGHT_CLASS)
    expect(html).not.toContain("sm:h-[240px]")
    expect(html).toContain('data-legend-position="under-title"')
    expect(html).toContain(`data-series-colour="${DELIVERY_CHART_COLOUR.delivered}"`)
    expect(html).toContain('data-series-format="currency-compact"')
    expect(html).not.toContain('data-series-key="planned"')
  })

  it.each([
    ["assumed-spend", "Assumed spend"],
    ["plan-only", "Awaiting delivery"],
  ] as const)("%s empty chart uses the shared empty copy", (key, title) => {
    const html = renderToStaticMarkup(
      <ChannelSection
        defaultOpen
        data={channelSection({
          key,
          title,
          series: [],
          startISO: "2026-04-15",
          daily: [],
        })}
      />,
    )
    expect(html).toContain(`Starts ${formatDateShort("2026-04-15")}`)
    expect(html).not.toContain("No daily delivery data available")
  })
})

