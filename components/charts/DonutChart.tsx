"use client"

import { useCallback, useMemo, useState } from "react"
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts"

import {
  normalizeRechartsTooltipPayload,
  UnifiedTooltip,
  type UnifiedTooltipRechartsProps,
} from "@/components/charts/UnifiedTooltip"
import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { getChartPalette } from "@/lib/client-dashboard/theme"

const DEFAULT_OTHER_KEY = "other"

export type DonutChartDatum = {
  key: string
  label?: string
  value: number
}

export type DonutChartProps = {
  data: DonutChartDatum[]
  colourFn?: (key: string, index: number) => string
  labelFn?: (key: string) => string
  valueFormatter?: (value: number) => string
  maxSlices?: number
  topNBeforeOther?: number
  showCenterTotal?: boolean
  innerRadius?: number
  outerRadius?: number
  height?: number
}

type DonutSlice = {
  key: string
  value: number
  percentage: number
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

function buildSlices(
  raw: DonutChartDatum[] | undefined,
  maxSlices: number,
  topNBeforeOther: number,
): { slices: DonutSlice[]; total: number; labelsByKey: Map<string, string | undefined> } {
  const labelsByKey = new Map<string, string | undefined>()
  if (!raw?.length) return { slices: [], total: 0, labelsByKey }

  const rows = raw.map((r) => {
    labelsByKey.set(r.key, r.label)
    return { key: r.key, value: Number(r.value) || 0 }
  })
  const positive = rows.filter((r) => r.value > 0)
  const total = positive.reduce((s, r) => s + r.value, 0)
  if (total <= 0) return { slices: [], total: 0, labelsByKey }

  const sorted = [...positive].sort((a, b) => b.value - a.value)

  let merged: Array<{ key: string; value: number }>
  if (sorted.length <= maxSlices) {
    merged = sorted
  } else {
    const top = sorted.slice(0, topNBeforeOther)
    const restSum = sorted.slice(topNBeforeOther).reduce((s, r) => s + r.value, 0)
    merged = [...top, { key: DEFAULT_OTHER_KEY, value: restSum }]
  }

  const slices: DonutSlice[] = merged.map((r) => ({
    key: r.key,
    value: r.value,
    percentage: total > 0 ? (r.value / total) * 100 : 0,
  }))

  return { slices, total, labelsByKey }
}

function displayLabel(key: string, labelsByKey: Map<string, string | undefined>, labelFn: (k: string) => string) {
  const explicit = labelsByKey.get(key)
  if (explicit != null && explicit.trim() !== "") return explicit
  return labelFn(key)
}

export function DonutChart({
  data,
  colourFn: colourFnProp,
  labelFn: labelFnProp,
  valueFormatter = formatCurrencyCompact,
  maxSlices = 8,
  topNBeforeOther = 7,
  showCenterTotal = true,
  innerRadius = 70,
  outerRadius = 110,
  height = 300,
}: DonutChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])

  const labelFn = useMemo(
    () => labelFnProp ?? ((k: string) => k),
    [labelFnProp],
  )

  const colourFn =
    colourFnProp ??
    ((_: string, index: number) => palette[index % palette.length] ?? "hsl(var(--muted-foreground))")

  const { slices, total, labelsByKey } = useMemo(
    () => buildSlices(data, maxSlices, topNBeforeOther),
    [data, maxSlices, topNBeforeOther],
  )

  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const renderTooltip = useCallback(
    (props: UnifiedTooltipRechartsProps) => {
      const normalized = normalizeRechartsTooltipPayload(props.payload)
      if (!props.active || normalized.length === 0) return null
      const row = normalized[0]!
      const sliceKey = row.name
      const label = displayLabel(sliceKey, labelsByKey, labelFn)
      return (
        <UnifiedTooltip
          active
          label=""
          payload={[{ name: label, value: row.value, color: row.color }]}
          formatValue={valueFormatter}
          showTotal={false}
        />
      )
    },
    [labelFn, labelsByKey, valueFormatter],
  )

  const isEmpty = slices.length === 0

  if (isEmpty) {
    return (
      <div
        className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground"
        style={{ minHeight: height }}
      >
        No data available
      </div>
    )
  }

  return (
    <>
      <div className="relative w-full">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              nameKey="key"
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
              {slices.map((entry, index) => (
                <Cell key={`${entry.key}-${index}`} fill={colourFn(entry.key, index)} />
              ))}
            </Pie>
            <Tooltip content={renderTooltip} wrapperStyle={{ cursor: "default", outline: "none" }} />
          </RechartsPieChart>
        </ResponsiveContainer>

        {showCenterTotal ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums text-foreground">{valueFormatter(total)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {slices.map((row, index) => (
          <div key={`${row.key}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <span
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: colourFn(row.key, index) }}
              aria-hidden
            />
            <span className="truncate text-foreground">
              {displayLabel(row.key, labelsByKey, labelFn)}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{valueFormatter(row.value)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
