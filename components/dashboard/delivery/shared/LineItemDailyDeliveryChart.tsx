"use client"

import { useMemo } from "react"
import { LineChart } from "@/components/charts/system"
import { EmptyState } from "@/components/ui/states"

export interface LineItemDailyDeliveryChartProps {
  daily: Array<Record<string, string | number>>
  series: Array<{ key: string; label: string; yAxis?: "left" | "right" }>
  asAtDate: string | null
  brandColour?: string
  height?: number
  /** Chart title displayed at the top of the chart card. */
  title?: string
  /** Optional subtitle displayed below the title. */
  subtitle?: string
}

export function LineItemDailyDeliveryChart({
  daily,
  series,
  asAtDate: _asAtDate,
  brandColour: _brandColour,
  height = 280,
  title,
  subtitle,
}: LineItemDailyDeliveryChartProps) {
  const data = useMemo(() => daily, [daily])
  if (data.length === 0 || series.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        {title || subtitle ? (
          <div className="mb-3">
            {title ? <p className="text-sm font-medium">{title}</p> : null}
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        ) : null}
        <EmptyState
          className="min-h-[200px] border-0 bg-transparent"
          title="No daily delivery data available"
          message={null}
        />
      </div>
    )
  }

  const chartSeries = series.map((s) => ({ key: s.key, label: s.label }))

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      {title || subtitle ? (
        <div className="mb-3">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      ) : null}
      <div style={{ minHeight: height }}>
        <LineChart
          data={data}
          xKey="date"
          series={chartSeries}
          valueFormat="dollars"
          smooth={false}
          dots={false}
          showLegend={series.length > 1}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
