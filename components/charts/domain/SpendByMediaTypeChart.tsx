"use client"

import { PieChart as PieChartIcon } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { EmptyState } from "@/components/ui/states"
import { getMediaColor, getMediaLabel } from "@/lib/charts/registry"

export interface SpendByMediaTypeChartProps {
  data: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside a parent shell. */
  embedded?: boolean
  height?: number
}

export default function SpendByMediaTypeChart({
  data,
  brandColour: _brandColour,
  embedded = false,
  height = 300,
}: SpendByMediaTypeChartProps) {
  const mapped = (data ?? []).map((item) => ({
    key: item.mediaType,
    value: Number(item.amount) || 0,
  }))
  const total = mapped.reduce((s, r) => (r.value > 0 ? s + r.value : s), 0)

  const chart = (
    <DonutChart
      data={mapped}
      colourFn={(key) => getMediaColor(key)}
      labelFn={(key) => getMediaLabel(key)}
      height={height}
    />
  )

  if (embedded) {
    if (total <= 0) {
      return (
        <EmptyState
          className="border-0 bg-transparent px-4 py-8"
          title="No spend data available"
          message={null}
          style={{ minHeight: height }}
        />
      )
    }
    return chart
  }

  return (
    <BaseChartCard
      title="Spend by Media Type"
      description="Distribution of spending across media types"
      variant="icon"
      icon={PieChartIcon}
      isEmpty={total <= 0}
      emptyMessage="No spend data available"
    >
      {chart}
    </BaseChartCard>
  )
}
