"use client"

import { PieChart as PieChartIcon } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { getMediaColor, getMediaLabel } from "@/lib/charts/registry"

export interface SpendByMediaTypeChartProps {
  data: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside `Panel`. */
  embedded?: boolean
}

export default function SpendByMediaTypeChart({
  data,
  brandColour: _brandColour,
  embedded: _embedded = false,
}: SpendByMediaTypeChartProps) {
  const mapped = (data ?? []).map((item) => ({
    key: item.mediaType,
    value: Number(item.amount) || 0,
  }))
  const total = mapped.reduce((s, r) => (r.value > 0 ? s + r.value : s), 0)

  return (
    <BaseChartCard
      title="Spend by Media Type"
      description="Distribution of spending across media types"
      variant="icon"
      icon={PieChartIcon}
      isEmpty={total <= 0}
      emptyMessage="No spend data available"
    >
      <DonutChart data={mapped} colourFn={(key) => getMediaColor(key)} labelFn={(key) => getMediaLabel(key)} />
    </BaseChartCard>
  )
}
