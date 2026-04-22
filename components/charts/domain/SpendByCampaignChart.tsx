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
  /** Omit outer card chrome when nested inside `Panel`. */
  embedded?: boolean
}

export default function SpendByCampaignChart({
  data,
  brandColour: _brandColour,
  embedded: _embedded = false,
}: SpendByCampaignChartProps) {
  const mapped = (data ?? []).map((item) => ({
    key: item.campaignName,
    value: Number(item.amount) || 0,
  }))
  const total = mapped.reduce((s, r) => (r.value > 0 ? s + r.value : s), 0)

  return (
    <BaseChartCard
      title="Spend by Campaign"
      description="Distribution of spending across campaigns"
      variant="icon"
      icon={PieChartIcon}
      isEmpty={total <= 0}
      emptyMessage="No spend data available"
    >
      <DonutChart
        data={mapped}
        colourFn={(key) => getDeterministicColor(key)}
        labelFn={(k) => k}
      />
    </BaseChartCard>
  )
}
