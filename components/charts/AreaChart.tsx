"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Area,
  AreaChart as RechartsAreaChart,
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

export type AreaChartSeries = { key: string; label: string }

function gradientIdForSeriesKey(key: string): string {
  return `area-gradient-${String(key).replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

export type AreaChartProps = {
  data: Array<Record<string, string | number>>
  xKey: string
  series: AreaChartSeries[]
  valueFormatter?: (value: number) => string
  xTickFormatter?: (value: string) => string
  height?: number
  smooth?: boolean
  showDots?: boolean
  stacked?: boolean
  fillOpacity?: number
}

export function AreaChart({
  data,
  xKey,
  series,
  valueFormatter = formatCurrencyAUD,
  xTickFormatter,
  height = 320,
  smooth = false,
  showDots = true,
  stacked = false,
  fillOpacity = 0.25,
}: AreaChartProps) {
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

  const curveType = smooth ? "monotone" : "linear"

  const renderTooltip = useUnifiedTooltip({
    formatValue: valueFormatter,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <defs>
            {series.map((s, i) => {
              const color = palette[i % palette.length]
              const id = gradientIdForSeriesKey(s.key)
              return (
                <linearGradient key={s.key} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
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
            const fillUrl = `url(#${gradientIdForSeriesKey(s.key)})`
            return (
              <Area
                key={s.key}
                type={curveType}
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                fill={fillUrl}
                stackId={stacked ? "a" : undefined}
                dot={showDots ? { r: 2, fill: color } : false}
                activeDot={showDots ? { r: 4 } : false}
                hide={hidden.has(s.key)}
              />
            )
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}
