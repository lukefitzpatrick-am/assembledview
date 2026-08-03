"use client"

import { useMemo } from "react"

import { BaseChartCard, ComboChart, MultiLineChart } from "@/components/charts/system"
import { EmptyState } from "@/components/ui/states"
import { channelColorFor } from "@/lib/chart-theme"

import { DELIVERY_DAILY_METRIC_LINE_COLOR } from "./deliveryDailyChartColors"
import { withDateLabels } from "./deliveryChartReshape"

export { DELIVERY_DAILY_METRIC_LINE_COLOR, DELIVERY_DAILY_METRIC_LINE_THEME_HEXES } from "./deliveryDailyChartColors"

export interface DeliveryDailyChartProps {
  daily: Array<Record<string, string | number>>
  series: Array<{ key: string; label: string; yAxis?: "left" | "right" }>
  asAtDate: string | null
  /** Channel media-type colour — wins for the spend/bar series when set. */
  mediaTypeColour?: string
  /** Client brand — fallback only when mediaTypeColour is absent (e.g. line-item charts). */
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
  brandColour,
  height = 280,
  title,
  subtitle,
}: DeliveryDailyChartProps) {
  const chartData = useMemo(() => withDateLabels(daily), [daily])

  const isDualAxis =
    series.length === 2 && series.some((s) => s.yAxis === "right") && series.some((s) => s.yAxis !== "right")

  const leftSeries = series.find((s) => s.yAxis !== "right") ?? series[0]
  const rightSeries = series.find((s) => s.yAxis === "right") ?? series[1]

  // Channel aggregate charts: media type wins. Brand remains a fallback for callers that omit mediaTypeColour.
  const spendColor =
    mediaTypeColour?.trim() || brandColour?.trim() || channelColorFor(leftSeries?.key ?? "spend", 0)
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
              format: "dollars",
            }}
            line={{
              key: rightSeries.key,
              label: rightSeries.label,
              color: metricColor,
              format: "number",
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
              color: i === 0 ? spendColor : channelColorFor(s.key, i),
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
