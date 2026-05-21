"use client"

import { PieChart as PieChartIcon } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { getDeterministicColor } from "@/lib/charts/registry"

export interface SpendByCampaignChartProps {
  data: Array<{
    campaignName: string
    mbaNumber: string
    amount: number
    percentage: number
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside a parent shell. */
  embedded?: boolean
  height?: number
}

export default function SpendByCampaignChart({
  data,
  brandColour: _brandColour,
  embedded = false,
  height = 300,
}: SpendByCampaignChartProps) {
  const mapped = (data ?? []).map((item) => ({
    key: item.campaignName,
    value: Number(item.amount) || 0,
  }))
  const total = mapped.reduce((s, r) => (r.value > 0 ? s + r.value : s), 0)

  const chart = (
    <DonutChart
      data={mapped}
      colourFn={(key) => getDeterministicColor(key)}
      labelFn={(k) => k}
      height={height}
    />
  )

  if (embedded) {
    if (total <= 0) {
      return (
        <div
          className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground"
          style={{ minHeight: height }}
        >
          No spend data available
        </div>
      )
    }
    return chart
  }

  return (
    <BaseChartCard
      title="Spend by Campaign"
      description="Distribution of spending across campaigns"
      variant="icon"
      icon={PieChartIcon}
      isEmpty={total <= 0}
      emptyMessage="No spend data available"
    >
      {chart}
    </BaseChartCard>
  )
}
