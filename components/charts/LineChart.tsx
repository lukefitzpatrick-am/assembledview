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
import { UnifiedTooltipPayloadItem, useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { ToggleableLegend } from "@/components/charts/ToggleableLegend"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { getChartPalette } from "@/lib/client-dashboard/theme"

const defaultCountFormatter = (n: number): string =>
  Math.round(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })

export type LineChartSeries = { key: string; label: string; yAxis?: "left" | "right" }

export type LineChartProps = {
  data: Array<Record<string, string | number>>
  xKey: string
  series: LineChartSeries[]
  /** Formatter for left-axis ticks and currency series tooltips. */
  valueFormatter?: (value: number) => string
  /** Formatter for right-axis ticks and count series tooltips. Defaults to en-AU integer with thousand separators. */
  countFormatter?: (value: number) => string
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
  countFormatter = defaultCountFormatter,
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

  const lineType = smooth ? "monotone" : "linear"
  const hasRightAxis = useMemo(() => series.some((s) => s.yAxis === "right"), [series])
  const rightAxisKeys = useMemo(
    () => new Set(series.filter((s) => s.yAxis === "right").map((s) => s.key)),
    [series],
  )
  const formatEntryValue = useMemo(() => {
    return (entry: UnifiedTooltipPayloadItem) => {
      const isCount = rightAxisKeys.has(entry.dataKey ?? "")
      return isCount ? countFormatter(entry.value) : valueFormatter(entry.value)
    }
  }, [rightAxisKeys, countFormatter, valueFormatter])

  const renderTooltip = useUnifiedTooltip({
    formatValue: valueFormatter,
    formatEntryValue,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: hasRightAxis ? 28 : 12, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickMargin={8}
            angle={data.length > 30 ? -25 : 0}
            textAnchor={data.length > 30 ? "end" : "middle"}
            height={data.length > 30 ? 52 : 28}
            tickFormatter={xTickFormatter as ((v: string) => string) | undefined}
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={44}
            tickFormatter={(v) => valueFormatter(Number(v))}
          />
          {hasRightAxis ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              width={44}
              tickFormatter={(v) => countFormatter(Number(v))}
            />
          ) : null}
          <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
          <Legend
            verticalAlign="bottom"
            align="center"
            content={() => <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={toggleKey} />}
          />
          {series.map((s, i) => {
            const color = palette[i % palette.length]
            return (
              <Line
                key={s.key}
                yAxisId={s.yAxis === "right" ? "right" : "left"}
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
