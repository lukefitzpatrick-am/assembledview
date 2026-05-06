"use client"

import { useMemo } from "react"
import { LineChart } from "@/components/charts/LineChart"
import { formatCurrencyAUD } from "@/lib/format/currency"

export interface LineItemDailyDeliveryChartProps {
  daily: Array<Record<string, string | number>>
  series: Array<{ key: string; label: string; yAxis?: "left" | "right" }>
  asAtDate: string | null
  brandColour?: string
  height?: number
}

function formatChartDateLabel(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(d)
}

export function LineItemDailyDeliveryChart({
  daily,
  series,
  asAtDate: _asAtDate,
  brandColour: _brandColour,
  height = 280,
}: LineItemDailyDeliveryChartProps) {
  // Note: today reference line and brand colour are not yet plumbed
  // through LineChart. Leaving the props in place for future extension.
  const data = useMemo(() => daily, [daily])
  if (data.length === 0 || series.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground">
        No daily delivery data available
      </div>
    )
  }

  return (
    <LineChart
      data={data}
      xKey="date"
      series={series}
      height={height}
      smooth={false}
      showDots={false}
      xTickFormatter={formatChartDateLabel}
      valueFormatter={formatCurrencyAUD}
    />
  )
}
