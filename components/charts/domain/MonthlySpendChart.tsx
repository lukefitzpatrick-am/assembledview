"use client"

import { useMemo } from "react"
import { BarChart3 } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import { getMediaLabel } from "@/lib/charts/registry"

export interface MonthlySpendChartProps {
  data: Array<{
    month: string
    data: Array<{
      mediaType: string
      amount: number
    }>
  }>
  brandColour?: string
  /** Omit `BaseChartCard` when the parent already supplies title / border chrome. */
  embedded?: boolean
  /** Plot height in px (embedded mode only; defaults to 320). */
  chartHeight?: number
}

export default function MonthlySpendChart({
  data,
  brandColour: _brandColour,
  embedded = false,
  chartHeight = 320,
}: MonthlySpendChartProps) {
  const pivoted = useMemo(
    () =>
      (data ?? []).map((month) => ({
        month: month.month,
        ...month.data.reduce(
          (acc, item) => {
            acc[item.mediaType] = item.amount
            return acc
          },
          {} as Record<string, number>,
        ),
      })),
    [data],
  )

  const series = useMemo(() => {
    const keys = new Set<string>()
    for (const row of pivoted) {
      for (const k of Object.keys(row)) {
        if (k !== "month") keys.add(k)
      }
    }
    return Array.from(keys)
      .sort()
      .map((key) => ({ key, label: getMediaLabel(key) }))
  }, [pivoted])

  const totalPositive = useMemo(
    () =>
      pivoted.reduce(
        (sum, row) =>
          sum +
          Object.entries(row).reduce((s, [k, v]) => (k === "month" ? s : s + Math.max(0, Number(v) || 0)), 0),
        0,
      ),
    [pivoted],
  )

  const isEmpty = pivoted.length === 0 || totalPositive <= 0

  if (embedded) {
    if (isEmpty) {
      return (
        <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
          No monthly spend data available
        </div>
      )
    }
    return <StackedColumnChart data={pivoted} xKey="month" series={series} height={chartHeight} />
  }

  return (
    <BaseChartCard
      title="Spend by Media Type by Month"
      description="Monthly spending trends for the current year"
      variant="icon"
      icon={BarChart3}
      isEmpty={isEmpty}
      emptyMessage="No spend data for this period"
    >
      <StackedColumnChart data={pivoted} xKey="month" series={series} />
    </BaseChartCard>
  )
}
