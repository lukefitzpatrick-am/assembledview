"use client"

import { useMemo, useCallback } from "react"
import { BarChart3 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { getDeterministicColor, getMediaLabel } from "@/lib/charts/registry"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { normaliseLineItemsByType, type NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { cn } from "@/lib/utils"

const TOOLTIP_SHELL_CLASS =
  "rounded-xl border border-border/60 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"

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
    // Smallest amount first so YAxis reversed places largest at the top
    const chartDataAscending = [...finalRows].sort((a, b) => a.amount - b.amount)

    return { chartDataAscending, total: sumTotal }
  }, [normalised])

  const renderTooltip = useCallback(
    (props: { active?: boolean; payload?: Array<{ payload?: PublisherRow }> }) => {
      if (!props.active || !props.payload?.length) return null
      const row = props.payload[0]?.payload
      if (!row) return null
      const pct = total > 0 ? (row.amount / total) * 100 : 0
      const title = publisherLabelForTick(row.publisher)

      return (
        <div className={TOOLTIP_SHELL_CLASS}>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
            {formatCurrencyCompact(row.amount)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{pct.toFixed(1)}% of total</p>
        </div>
      )
    },
    [total],
  )

  const isEmpty = chartDataAscending.length === 0 || total <= 0

  return (
    <div
      className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}
    >
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <BarChart3 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">Spend by Publisher</h3>
          <p className="text-xs text-muted-foreground">Top publishers by gross media investment</p>
        </div>
      </div>

      {isEmpty ? (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ minHeight: chartHeight }}
        >
          No publisher spend from line items
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={chartDataAscending}
            margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
            barCategoryGap="18%"
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrencyCompact(Number(v) || 0)}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="publisher"
              width={140}
              reversed
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => publisherLabelForTick(String(v))}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.15)" }} wrapperStyle={{ outline: "none" }} />
            <Bar dataKey="amount" barSize={24} radius={[0, 4, 4, 0]} cursor="default">
              {chartDataAscending.map((row) => (
                <Cell key={row.publisher} fill={getDeterministicColor(row.publisher)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
