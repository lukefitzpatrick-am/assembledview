"use client"

import { useMemo } from "react"
import { BarChart3 } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import { EmptyState } from "@/components/ui/states"
import { getMediaLabel } from "@/lib/charts/registry"

export type MonthlyStackedEntry = {
  month: string
  data: Array<{
    key?: string
    mediaType?: string
    campaignName?: string
    amount: number
  }>
}

function resolveEntryKey(item: MonthlyStackedEntry["data"][number]): string {
  return item.key ?? item.mediaType ?? item.campaignName ?? "Unspecified"
}

export interface MonthlySpendChartProps {
  data: MonthlyStackedEntry[]
  brandColour?: string
  /** Omit `BaseChartCard` when the parent already supplies title / border chrome. */
  embedded?: boolean
  /** Plot height in px (embedded mode only; defaults to 320). */
  chartHeight?: number
  getSeriesLabel?: (key: string) => string
  legendVerticalAlign?: "top" | "bottom"
  hiddenKeys?: Set<string>
  onHiddenKeysChange?: (next: Set<string>) => void
}

export default function MonthlySpendChart({
  data,
  brandColour: _brandColour,
  embedded = false,
  chartHeight = 320,
  getSeriesLabel = getMediaLabel,
  legendVerticalAlign = "top",
  hiddenKeys,
  onHiddenKeysChange,
}: MonthlySpendChartProps) {
  const pivoted = useMemo(
    () =>
      (data ?? []).map((month) => ({
        month: month.month,
        ...month.data.reduce(
          (acc, item) => {
            const key = resolveEntryKey(item)
            acc[key] = (acc[key] || 0) + item.amount
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
      .map((key) => ({ key, label: getSeriesLabel(key) }))
  }, [getSeriesLabel, pivoted])

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

  const chart = (
    <StackedColumnChart
      data={pivoted}
      xKey="month"
      series={series}
      height={embedded ? chartHeight : undefined}
      legendVerticalAlign={legendVerticalAlign}
      hiddenKeys={hiddenKeys}
      onHiddenKeysChange={onHiddenKeysChange}
    />
  )

  if (embedded) {
    if (isEmpty) {
      return (
        <EmptyState
          className="min-h-80 border-0 bg-transparent"
          title="No monthly spend data available"
          message={null}
        />
      )
    }
    return chart
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
      {chart}
    </BaseChartCard>
  )
}
