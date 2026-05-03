"use client"

import { useCallback, useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
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

export type LineChartSeries = { key: string; label: string }

export type LineChartProps = {
  data: Array<Record<string, string | number>>
  xKey: string
  series: LineChartSeries[]
  valueFormatter?: (value: number) => string
  xTickFormatter?: (value: string) => string
  height?: number
  smooth?: boolean
  showDots?: boolean
}

export function LineChart({
  data,
  xKey,
  series,
  valueFormatter = formatCurrencyAUD,
  xTickFormatter,
  height = 320,
  smooth = false,
  showDots = true,
}: LineChartProps) {
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

  const lineType = smooth ? "monotone" : "linear"

  const renderTooltip = useUnifiedTooltip({
    formatValue: valueFormatter,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
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
            tickFormatter={xTickFormatter as ((v: string) => string) | undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={44}
            tickFormatter={(v) => valueFormatter(Number(v))}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
          <Legend
            verticalAlign="top"
            align="center"
            content={() => <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={toggleKey} />}
          />
          {series.map((s, i) => {
            const color = palette[i % palette.length]
            return (
              <Line
                key={s.key}
                type={lineType}
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                dot={showDots ? { r: 2, fill: color } : false}
                activeDot={showDots ? { r: 4 } : false}
                hide={hidden.has(s.key)}
              />
            )
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
}
