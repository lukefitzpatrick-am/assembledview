"use client"

import { useCallback, useMemo, useState } from "react"
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
import { formatCurrencyAUD } from "@/lib/format/currency"
import { getChartPalette } from "@/lib/client-dashboard/theme"

export type HorizontalBarSeries = { key: string; label: string }

export type HorizontalBarChartProps = {
  data: Array<Record<string, number | string>>
  xKey: string
  series: HorizontalBarSeries[]
  /** Tooltip value format; defaults to AUD (horizontal spend bars). */
  valueFormatter?: (value: number) => string
  /** Formats numeric tick values on the horizontal (value) axis. */
  xAxisFormatter?: (value: number) => string
  /** When `layout="vertical"`, reverses category order on the Y axis (e.g. largest bar at the top). */
  yAxisReversed?: boolean
  /** Pixel width of the category (Y) axis when `layout="vertical"`. */
  yAxisWidth?: number
  height?: number
}

export function HorizontalBarChart({
  data,
  xKey,
  series,
  valueFormatter = formatCurrencyAUD,
  xAxisFormatter,
  yAxisReversed = false,
  yAxisWidth = 80,
  height = 320,
}: HorizontalBarChartProps) {
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
        color: palette[i % palette.length],
      })),
    [palette, series],
  )

  const renderTooltip = useUnifiedTooltip({
    formatValue: valueFormatter,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
          barCategoryGap="16%"
        >
          <CartesianGrid stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={xAxisFormatter as ((v: number) => string) | undefined}
          />
          <YAxis
            type="category"
            dataKey={xKey}
            width={yAxisWidth}
            reversed={yAxisReversed}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
          <Legend
            verticalAlign="top"
            align="center"
            content={() => <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={toggleKey} />}
          />
          {series.map((s, i) => {
            const isEnd = i === series.length - 1
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={palette[i % palette.length]}
                hide={hidden.has(s.key)}
                radius={isEnd ? ([0, 3, 3, 0] as [number, number, number, number]) : ([0, 0, 0, 0] as [number, number, number, number])}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** @deprecated Use `HorizontalBarChart` — renamed in chart consolidation. */
export const StackedBarChart = HorizontalBarChart

/** @deprecated Use `HorizontalBarChartProps` */
export type StackedBarChartProps = HorizontalBarChartProps

/** @deprecated Use `HorizontalBarSeries` */
export type StackedBarSeries = HorizontalBarSeries
