"use client"

import { useMemo } from "react"
import { BarChart3 } from "lucide-react"

import BaseChartCard from "@/components/charts/BaseChartCard"
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { getMediaLabel } from "@/lib/charts/registry"
import { normaliseLineItemsByType, type NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

const UNKNOWN_PUBLISHER = "Unknown"
const OTHER_BUCKET = "Other"
const MAX_PUBLISHERS = 10
const TOP_N_BEFORE_OTHER = 9

export interface SpendByPublisherChartProps {
  /** Raw or normalised line items by media type (normalised inside the component). */
  lineItems: Record<string, NormalisedLineItem[] | any[]>
  /** Chart plot height in px (matches sibling campaign charts). */
  chartHeight?: number
  className?: string
}

type PublisherRow = {
  publisher: string
  amount: number
}

function burstGross(burst: { budget?: number; deliverablesAmount?: number }): number {
  const fromDeliverables =
    typeof burst.deliverablesAmount === "number" && Number.isFinite(burst.deliverablesAmount)
      ? burst.deliverablesAmount
      : 0
  const fromBudget = typeof burst.budget === "number" && Number.isFinite(burst.budget) ? burst.budget : 0
  return fromDeliverables > 0 ? fromDeliverables : fromBudget
}

function publisherLabelForTick(raw: string): string {
  if (raw === UNKNOWN_PUBLISHER) return UNKNOWN_PUBLISHER
  if (raw === OTHER_BUCKET) return OTHER_BUCKET
  return getMediaLabel(raw)
}

export default function SpendByPublisherChart({
  lineItems,
  chartHeight = 300,
  className,
}: SpendByPublisherChartProps) {
  const normalised = useMemo(() => normaliseLineItemsByType(lineItems || {}), [lineItems])

  const { chartDataAscending, total } = useMemo(() => {
    const totals = new Map<string, number>()

    Object.values(normalised).forEach((items) => {
      if (!Array.isArray(items)) return
      items.forEach((item) => {
        const raw =
          item.publisher || item.platform || item.network || item.site || item.station
        const name =
          raw != null && String(raw).trim().length > 0 ? String(raw).trim() : UNKNOWN_PUBLISHER

        item.bursts?.forEach((burst) => {
          const gross = burstGross(burst)
          if (gross > 0) {
            totals.set(name, (totals.get(name) ?? 0) + gross)
          }
        })
      })
    })

    const rows: PublisherRow[] = Array.from(totals.entries()).map(([publisher, amount]) => ({
      publisher,
      amount,
    }))

    rows.sort((a, b) => b.amount - a.amount)

    let finalRows: PublisherRow[]
    if (rows.length <= MAX_PUBLISHERS) {
      finalRows = rows
    } else {
      const top = rows.slice(0, TOP_N_BEFORE_OTHER)
      const restSum = rows.slice(TOP_N_BEFORE_OTHER).reduce((s, r) => s + r.amount, 0)
      finalRows = [...top, { publisher: OTHER_BUCKET, amount: restSum }]
    }

    const sumTotal = finalRows.reduce((s, r) => s + r.amount, 0)
    const chartDataAscending = [...finalRows].sort((a, b) => a.amount - b.amount)

    return { chartDataAscending, total: sumTotal }
  }, [normalised])

  const barRows = useMemo(
    () =>
      chartDataAscending.map((r) => ({
        channel: publisherLabelForTick(r.publisher),
        value: r.amount,
      })),
    [chartDataAscending],
  )

  return (
    <BaseChartCard
      className={className}
      title="Spend by Publisher"
      description="Top publishers by gross media investment"
      variant="icon"
      icon={BarChart3}
      isEmpty={chartDataAscending.length === 0 || total <= 0}
      emptyMessage="No publisher spend from line items"
      minHeight={chartHeight}
      contentClassName="min-h-0"
    >
      <HorizontalBarChart
        data={barRows}
        xKey="channel"
        series={[{ key: "value", label: "Spend" }]}
        xAxisFormatter={formatCurrencyCompact}
        yAxisReversed
        yAxisWidth={140}
        height={chartHeight}
      />
    </BaseChartCard>
  )
}
