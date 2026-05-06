"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import {
  useUnifiedTooltip,
  type UnifiedTooltipPayloadItem,
} from "@/components/charts/UnifiedTooltip"
import { ToggleableLegend } from "@/components/charts/ToggleableLegend"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { getChartPalette } from "@/lib/client-dashboard/theme"

export type ComboBarSeries = { key: string; label: string }
export type ComboLineSeries = { key: string; label: string; yAxis: "left" | "right" }

export type ComboChartProps = {
  data: Array<Record<string, number | string>>
  xKey: string
  bars: ComboBarSeries[]
  lines: ComboLineSeries[]
  /**
   * Series `dataKey`s that represent counts (not currency), e.g. orders on a
   * right axis while bars are revenue. Other keys use `formatCurrencyAUD`.
   */
  countDataKeys?: string[]
  height?: number
}

function formatCountTooltipValue(v: number): string {
  return Math.round(v).toLocaleString("en-AU", { maximumFractionDigits: 0 })
}

export function ComboChart({ data, xKey, bars, lines, countDataKeys, height = 320 }: ComboChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const hasRightAxis = useMemo(() => lines.some((l) => l.yAxis === "right"), [lines])

  const toggleKey = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const legendPayload = useMemo(() => {
    const items: { value: string; dataKey: string; color: string }[] = []
    let c = 0
    for (const b of bars) {
      items.push({ value: b.label, dataKey: b.key, color: palette[c % palette.length] })
      c += 1
    }
    for (const ln of lines) {
      items.push({ value: ln.label, dataKey: ln.key, color: palette[c % palette.length] })
      c += 1
    }
    return items
  }, [bars, lines, palette])

  const countKeySet = useMemo(() => new Set(countDataKeys ?? []), [countDataKeys])

  const formatEntryValue = useMemo(() => {
    if (countKeySet.size === 0) return undefined
    return (entry: UnifiedTooltipPayloadItem) => {
      const dk = entry.dataKey ?? ""
      return countKeySet.has(dk) ? formatCountTooltipValue(entry.value) : formatCurrencyAUD(entry.value)
    }
  }, [countKeySet])

  const renderTooltip = useUnifiedTooltip({
    formatValue: formatCurrencyAUD,
    formatEntryValue,
    showTotal: false,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: hasRightAxis ? 28 : 12, left: 4, bottom: 8 }}>
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
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={44}
          />
          {hasRightAxis ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              width={44}
            />
          ) : null}
          <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
          <Legend
            verticalAlign="top"
            align="center"
            content={() => <ToggleableLegend payload={legendPayload} hiddenKeys={hidden} onToggleKey={toggleKey} />}
          />
          {bars.map((b, i) => (
            <Bar
              key={b.key}
              yAxisId="left"
              dataKey={b.key}
              name={b.label}
              fill={palette[i % palette.length]}
              hide={hidden.has(b.key)}
              radius={[2, 2, 0, 0]}
            />
          ))}
          {lines.map((ln, j) => {
            const color = palette[(bars.length + j) % palette.length]
            return (
              <Line
                key={ln.key}
                yAxisId={ln.yAxis === "right" ? "right" : "left"}
                type="monotone"
                dataKey={ln.key}
                name={ln.label}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2, fill: color }}
                activeDot={{ r: 4 }}
                hide={hidden.has(ln.key)}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** @deprecated Use `ComboChart` — renamed in chart consolidation. */
export const ComboBarLineChart = ComboChart

/** @deprecated Use `ComboChartProps` */
export type ComboBarLineChartProps = ComboChartProps
