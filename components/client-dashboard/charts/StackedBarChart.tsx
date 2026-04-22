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
import {
  CD_CHART_TOOLTIP_CONTENT,
  CD_CHART_TOOLTIP_ITEM_STYLE,
  CD_CHART_TOOLTIP_LABEL_STYLE,
} from "@/components/client-dashboard/charts/chartStyles"
import { ToggleableLegend } from "@/components/client-dashboard/charts/ToggleableLegend"
import { getChartPalette } from "@/lib/client-dashboard/theme"

export type StackedBarSeries = { key: string; label: string }

export type StackedBarChartProps = {
  data: Array<Record<string, number | string>>
  xKey: string
  series: StackedBarSeries[]
  /** Formats numeric tick values on the horizontal (value) axis. */
  xAxisFormatter?: (value: number) => string
  height?: number
}

export function StackedBarChart({
  data,
  xKey,
  series,
  xAxisFormatter,
  height = 320,
}: StackedBarChartProps) {
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
            width={80}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CD_CHART_TOOLTIP_CONTENT}
            labelStyle={CD_CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CD_CHART_TOOLTIP_ITEM_STYLE}
            cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
            formatter={(value: number | string, name: string) => [value, name]}
          />
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
