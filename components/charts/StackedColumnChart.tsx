"use client"

import { useCallback, useMemo, useState } from "react"

import {
  finalizeChartDatumClickPayload,
  type ChartDatumClickCore,
  type ChartDatumClickPayload,
  type ChartStackedColumnRow,
} from "@/components/charts/chartDatumClick"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { ToggleableLegend } from "@/components/charts/ToggleableLegend"
import { getChartPalette } from "@/lib/client-dashboard/theme"

/** @deprecated Prefer `ChartStackedColumnRow` from `chartDatumClick` — legacy admin chart row shape (Phase 3). */
export type StackedColumnData = ChartStackedColumnRow

export type StackedColumnSeries = { key: string; label: string }

export type StackedColumnChartProps = {
  data: Array<Record<string, number | string>>
  xKey: string
  series: StackedColumnSeries[]
  height?: number
  /** Optional per-series fill overrides (e.g. client profile colours on the admin dashboard). */
  seriesColorByKey?: Record<string, string>
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  getDatumId?: (core: ChartDatumClickCore) => string
  /**
   * When set with `onDatumClick`, legend clicks filter (admin dashboard) instead of toggling
   * series visibility.
   */
  filterViaLegend?: boolean
}

type BarSegClick = { payload?: ChartStackedColumnRow; value?: number | [number, number] }

export function StackedColumnChart({
  data,
  xKey,
  series,
  height = 320,
  seriesColorByKey,
  onDatumClick,
  getDatumId,
  filterViaLegend = false,
}: StackedColumnChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const toggleKey = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const legendPayload = useMemo(
    () =>
      series.map((s, i) => ({
        value: s.label,
        dataKey: s.key,
        color: seriesColorByKey?.[s.key] ?? palette[i % palette.length],
      })),
    [palette, series, seriesColorByKey],
  )

  const onLegendButton = useCallback(
    (key: string) => {
      if (filterViaLegend && onDatumClick) {
        const sum = data.reduce((s, row) => s + Math.max(0, Number(row[key]) || 0), 0)
        const idx = Math.max(0, series.findIndex((t) => t.key === key))
        onDatumClick(
          finalizeChartDatumClickPayload(
            {
              chart: "stackedColumn",
              source: "legend",
              name: key,
              value: sum,
              category: "",
              index: idx,
              datum: null,
            },
            getDatumId,
          ),
        )
        return
      }
      toggleKey(key)
    },
    [filterViaLegend, onDatumClick, data, series, getDatumId, toggleKey],
  )

  const xTickInterval = useMemo(() => {
    if (data.length <= 10) return 0
    return Math.max(1, Math.ceil(data.length / 7) - 1)
  }, [data.length])

  const renderTooltip = useUnifiedTooltip({
    formatValue: (v) =>
      v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} barCategoryGap="18%">
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={xTickInterval}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickMargin={8}
            angle={data.length > 8 ? -25 : 0}
            textAnchor={data.length > 8 ? "end" : "middle"}
            height={data.length > 8 ? 52 : 28}
          />
          <YAxis
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={40}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
          <Legend
            verticalAlign="top"
            align="center"
            content={() => (
              <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={onLegendButton} />
            )}
          />
          {series.map((s, i) => {
            const isTop = i === series.length - 1
            const fill = seriesColorByKey?.[s.key] ?? palette[i % palette.length]
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={fill}
                hide={hidden.has(s.key)}
                cursor={onDatumClick ? "pointer" : "default"}
                radius={isTop ? ([3, 3, 0, 0] as [number, number, number, number]) : ([0, 0, 0, 0] as [number, number, number, number])}
                onClick={
                  onDatumClick
                    ? (barProps: BarSegClick) => {
                        const row = barProps.payload
                        const catRaw = row?.[xKey]
                        if (!row || typeof catRaw !== "string") return
                        const rawVal = barProps.value
                        const v = Array.isArray(rawVal) ? Number(rawVal[1]) || 0 : Number(rawVal) || 0
                        onDatumClick(
                          finalizeChartDatumClickPayload(
                            {
                              chart: "stackedColumn",
                              source: "bar",
                              name: s.key,
                              value: v,
                              category: catRaw,
                              index: i,
                              datum: row,
                            },
                            getDatumId,
                          ),
                        )
                      }
                    : undefined
                }
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
