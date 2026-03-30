"use client"

import { useCallback, useMemo, useState } from "react"
import { PieChart as PieChartIcon } from "lucide-react"
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts"

import { formatCurrencyCompact } from "@/lib/format/currency"
import { getMediaColor, getMediaLabel } from "@/lib/charts/registry"
import { cn } from "@/lib/utils"

const TOOLTIP_SHELL_CLASS =
  "rounded-xl border border-border/60 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"

/** Aggregated "Other" bucket key — normalises to a stable colour via registry. */
const OTHER_MEDIA_KEY = "other"

interface MediaChannelPieChartProps {
  data: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
}

type ChartRow = {
  mediaType: string
  amount: number
  percentage: number
}

const MAX_SLICES = 8
const TOP_N_BEFORE_OTHER = 7

function buildChartSeries(
  raw: MediaChannelPieChartProps["data"] | undefined,
): { series: ChartRow[]; total: number } {
  if (!raw?.length) return { series: [], total: 0 }
  const rows = raw.map((r) => ({
    mediaType: r.mediaType,
    amount: Number(r.amount) || 0,
  }))
  const positive = rows.filter((r) => r.amount > 0)
  const total = positive.reduce((s, r) => s + r.amount, 0)
  if (total <= 0) return { series: [], total: 0 }

  const sorted = [...positive].sort((a, b) => b.amount - a.amount)

  let slices: Array<{ mediaType: string; amount: number }>
  if (sorted.length <= MAX_SLICES) {
    slices = sorted
  } else {
    const top = sorted.slice(0, TOP_N_BEFORE_OTHER)
    const restSum = sorted.slice(TOP_N_BEFORE_OTHER).reduce((s, r) => s + r.amount, 0)
    slices = [...top, { mediaType: OTHER_MEDIA_KEY, amount: restSum }]
  }

  const series: ChartRow[] = slices.map((r) => ({
    ...r,
    percentage: total > 0 ? (r.amount / total) * 100 : 0,
  }))

  return { series, total }
}

type ActiveShapeProps = {
  cx?: number
  cy?: number
  startAngle?: number
  endAngle?: number
  innerRadius?: number
  outerRadius?: number
  fill?: string
}

function renderActiveShape(props: ActiveShapeProps) {
  const { cx, cy, startAngle, endAngle, innerRadius: ir, outerRadius: or, fill } = props
  if (
    cx == null ||
    cy == null ||
    startAngle == null ||
    endAngle == null ||
    ir == null ||
    or == null ||
    !fill
  ) {
    return <g />
  }
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={ir}
      outerRadius={or + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="hsl(var(--background))"
      strokeWidth={2}
    />
  )
}

export default function MediaChannelPieChart({ data }: MediaChannelPieChartProps) {
  const { series: chartSeries, total: totalAmount } = useMemo(() => buildChartSeries(data), [data])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const renderTooltip = useCallback(
    (tooltipProps: { active?: boolean; payload?: Array<{ payload?: ChartRow }> }) => {
      if (!tooltipProps.active || !tooltipProps.payload?.length) return null
      const row = tooltipProps.payload[0]?.payload
      if (!row) return null
      const amount = Number(row.amount) || 0
      const pct = totalAmount > 0 ? (amount / totalAmount) * 100 : 0
      const label = getMediaLabel(row.mediaType)

      return (
        <div className={TOOLTIP_SHELL_CLASS}>
          <p className="font-semibold text-foreground">{label}</p>
          <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
            {formatCurrencyCompact(amount)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
          <div className="my-2 border-t border-border/60" />
          <div className="flex items-center justify-between gap-4 text-xs font-medium text-foreground">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatCurrencyCompact(totalAmount)}</span>
          </div>
        </div>
      )
    },
    [totalAmount],
  )

  const isEmpty = chartSeries.length === 0

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <PieChartIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">Spend by Media Type</h3>
          <p className="text-xs text-muted-foreground">Total: {formatCurrencyCompact(totalAmount)}</p>
        </div>
      </div>

      {isEmpty ? (
        <div
          className={cn(
            "flex min-h-[200px] items-center justify-center px-4 py-8 text-sm text-muted-foreground",
          )}
        >
          No spend data available
        </div>
      ) : (
        <>
          <div className="relative w-full">
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={chartSeries}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="mediaType"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  label={false}
                  cursor="default"
                  isAnimationActive
                  animationDuration={400}
                  animationEasing="ease-out"
                  activeIndex={activeIndex ?? undefined}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartSeries.map((entry, index) => (
                    <Cell key={`${entry.mediaType}-${index}`} fill={getMediaColor(entry.mediaType)} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} wrapperStyle={{ cursor: "default", outline: "none" }} />
              </RechartsPieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
                  {formatCurrencyCompact(totalAmount)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {chartSeries.map((row, index) => (
              <div
                key={`${row.mediaType}-${index}`}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5"
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ backgroundColor: getMediaColor(row.mediaType) }}
                  aria-hidden
                />
                <span className="truncate text-foreground">{getMediaLabel(row.mediaType)}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCurrencyCompact(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
