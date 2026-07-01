"use client"

import { useMemo } from "react"

import { BaseChartCard, ComboChart, MultiLineChart } from "@/components/charts/system"
import { EmptyState } from "@/components/ui/states"
import { channelColorFor, STATUS } from "@/lib/chart-theme"

import { withDateLabels } from "./deliveryChartReshape"

export interface DeliveryDailyChartProps {
  daily: Array<Record<string, string | number>>
  series: Array<{ key: string; label: string; yAxis?: "left" | "right" }>
  asAtDate: string | null
  brandColour?: string
  height?: number
  title?: string
  subtitle?: string
}

export function DeliveryDailyChart({
  daily,
  series,
  asAtDate: _asAtDate,
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

  const spendColor = brandColour ?? channelColorFor(leftSeries?.key ?? "spend", 0)
  const metricColor = STATUS.onTrack

  const chartWrapStyle = { height } as const

  if (chartData.length === 0 || series.length === 0) {
    return (
      <BaseChartCard title={title ?? "Daily delivery"} subtitle={subtitle}>
        <EmptyState
          className="min-h-[200px] border-0 bg-transparent"
          title="No daily delivery data available"
          message={null}
        />
      </BaseChartCard>
    )
  }

  return (
    <BaseChartCard title={title ?? "Daily delivery"} subtitle={subtitle}>
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
