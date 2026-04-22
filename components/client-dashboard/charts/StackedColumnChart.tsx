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

export type StackedColumnSeries = { key: string; label: string }

export type StackedColumnChartProps = {
  data: Array<Record<string, number | string>>
  xKey: string
  series: StackedColumnSeries[]
  height?: number
}

export function StackedColumnChart({ data, xKey, series, height = 320 }: StackedColumnChartProps) {
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

  const xTickInterval = useMemo(() => {
    if (data.length <= 10) return 0
    return Math.max(1, Math.ceil(data.length / 7) - 1)
  }, [data.length])

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
          <Tooltip
            contentStyle={CD_CHART_TOOLTIP_CONTENT}
            labelStyle={CD_CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CD_CHART_TOOLTIP_ITEM_STYLE}
            cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
          />
          <Legend
            verticalAlign="top"
            align="center"
            content={() => <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={toggleKey} />}
          />
          {series.map((s, i) => {
            const isTop = i === series.length - 1
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={palette[i % palette.length]}
                hide={hidden.has(s.key)}
                radius={isTop ? ([3, 3, 0, 0] as [number, number, number, number]) : ([0, 0, 0, 0] as [number, number, number, number])}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
