"use client"

import { useMemo } from "react"

import { BaseChartCard, ComboChart, MultiLineChart } from "@/components/charts/system"
import { EmptyState } from "@/components/ui/states"
import { BRAND } from "@/lib/brand"
import { BRAND_SERIES } from "@/lib/design/mediaFamilies"

import { DELIVERY_DAILY_METRIC_LINE_COLOR } from "./deliveryDailyChartColors"
import { withDateLabels } from "./deliveryChartReshape"

export { DELIVERY_DAILY_METRIC_LINE_COLOR, DELIVERY_DAILY_METRIC_LINE_THEME_HEXES } from "./deliveryDailyChartColors"

export type DeliveryDailyChartSeries = {
  key: string
  label: string
  yAxis?: "left" | "right"
  /** ComboChart value format. Bars default to "dollars", lines to
   *  "number", preserving pre-BV1 behaviour for callers that omit it. */
  format?: "dollars" | "number" | "compact" | "percent"
}

export interface DeliveryDailyChartProps {
  daily: Array<Record<string, string | number>>
  series: DeliveryDailyChartSeries[]
  asAtDate: string | null
  /** Channel media-type colour — wins for the spend/bar series when set. */
  mediaTypeColour?: string
  /** @deprecated Unused for paint. Media colour, else forest. */
  brandColour?: string
  height?: number
  title?: string
  subtitle?: string
}

export function DeliveryDailyChart({
  daily,
  series,
  asAtDate: _asAtDate,
  mediaTypeColour,
  brandColour: _brandColour,
  height = 280,
  title,
  subtitle,
}: DeliveryDailyChartProps) {
  const chartData = useMemo(() => withDateLabels(daily), [daily])

  const isDualAxis =
    series.length === 2 && series.some((s) => s.yAxis === "right") && series.some((s) => s.yAxis !== "right")

  const leftSeries = series.find((s) => s.yAxis !== "right") ?? series[0]
  const rightSeries = series.find((s) => s.yAxis === "right") ?? series[1]

  const spendColor = mediaTypeColour?.trim() || BRAND.colour.forest
  const metricColor = DELIVERY_DAILY_METRIC_LINE_COLOR

  const chartWrapStyle = { height } as const

  if (chartData.length === 0 || series.length === 0) {
    return (
      <BaseChartCard
        title={title ?? "Daily delivery"}
        subtitle={subtitle}
        exportPage="pacing"
        hideExport
      >
        <EmptyState
          className="min-h-[200px] border-0 bg-transparent"
          title="No daily delivery data available"
          message={null}
        />
      </BaseChartCard>
    )
  }

  return (
    <BaseChartCard
      title={title ?? "Daily delivery"}
      subtitle={subtitle}
      exportPage="pacing"
      exportSeries={{
        data: chartData,
        xKey: "dateLabel",
        seriesKeys: series.map((s) => s.key),
      }}
    >
      <div className="w-full" style={chartWrapStyle}>
        {isDualAxis && leftSeries && rightSeries ? (
          <ComboChart
            data={chartData}
            xKey="dateLabel"
            bar={{
              key: leftSeries.key,
              label: leftSeries.label,
              color: spendColor,
              format: leftSeries.format ?? "dollars",
            }}
            line={{
              key: rightSeries.key,
              label: rightSeries.label,
              color: metricColor,
              format: rightSeries.format ?? "number",
            }}
            className="h-full w-full"
          />
        ) : (
          <MultiLineChart
            data={chartData}
            xKey="dateLabel"
            series={series.map((s, i) => ({
              key: s.key,
              label: s.label,
              color: i === 0 ? spendColor : BRAND_SERIES[i % BRAND_SERIES.length],
            }))}
            valueFormat="compact"
            smooth={false}
            dots={false}
            showLegend
            className="h-full w-full"
          />
        )}
      </div>
    </BaseChartCard>
  )
}
