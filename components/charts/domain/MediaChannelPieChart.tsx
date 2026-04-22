"use client"

import { PieChart as PieChartIcon } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { DonutChart } from "@/components/charts/DonutChart"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { getMediaColor, getMediaLabel } from "@/lib/charts/registry"

type Props = {
  data: Array<{ mediaType: string; amount: number }>
}

export default function MediaChannelPieChart({ data }: Props) {
  const mapped = (data ?? []).map((d) => ({
    key: d.mediaType,
    value: Number(d.amount) || 0,
  }))
  const total = mapped.reduce((s, r) => (r.value > 0 ? s + r.value : s), 0)

  return (
    <BaseChartCard
      title="Spend by Media Type"
      description={`Total: ${formatCurrencyCompact(total)}`}
      variant="icon"
      icon={PieChartIcon}
      isEmpty={total <= 0}
      emptyMessage="No spend data available"
    >
      <DonutChart data={mapped} colourFn={(key) => getMediaColor(key)} labelFn={(key) => getMediaLabel(key)} />
    </BaseChartCard>
  )
}
