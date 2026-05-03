"use client"

import { useCallback, useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import {
  UnifiedTooltip,
  type UnifiedTooltipRechartsPayloadEntry,
  type UnifiedTooltipRechartsProps,
} from "@/components/charts/UnifiedTooltip"

const POSITIVE_STATUS = "#10B981"
const NEGATIVE_STATUS = "#F43F5E"

export type WaterfallDatum = {
  label: string
  value: number
  type: "start" | "positive" | "negative" | "total"
}

export type WaterfallChartProps = {
  data: WaterfallDatum[]
  height?: number
  valueFormatter?: (value: number) => string
}

function compactSigned(value: number): string {
  const abs = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}m`
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(abs % 1 === 0 ? 0 : 1)}`
}

type ComputedWaterfallDatum = WaterfallDatum & {
  base: number
  bar: number
  top: number
  color: string
}

export function WaterfallChart({ data, height = 320, valueFormatter }: WaterfallChartProps) {
  const theme = useClientBrand()

  const chartData = useMemo<ComputedWaterfallDatum[]>(() => {
    let running = 0
    return data.map((item) => {
      if (item.type === "start") {
        running = item.value
        return {
          ...item,
          base: 0,
          bar: item.value,
          top: item.value,
          color: theme.primary,
        }
      }
      if (item.type === "total") {
        running = item.value
        return {
          ...item,
          base: 0,
          bar: item.value,
          top: item.value,
          color: theme.primary,
        }
      }
      const next = running + item.value
      const base = Math.min(running, next)
      const bar = Math.abs(item.value)
      const top = Math.max(running, next)
      running = next
      return {
        ...item,
        base,
        bar,
        top,
        color: item.type === "positive" ? POSITIVE_STATUS : NEGATIVE_STATUS,
      }
    })
  }, [data, theme.primary])

  const fmt = valueFormatter ?? compactSigned

  const renderTooltip = useCallback(
    (props: UnifiedTooltipRechartsProps) => {
      type BarPayloadEntry = UnifiedTooltipRechartsPayloadEntry & {
        payload?: ComputedWaterfallDatum
      }
      const barEntry = props.payload?.find(
        (p: BarPayloadEntry) => String(p.dataKey) === "bar",
      ) as BarPayloadEntry | undefined
      if (!props.active || !barEntry) return null
      const raw = barEntry.payload
      if (!raw) return null
      return (
        <UnifiedTooltip
          active
          label={raw.label}
          payload={[{ name: "Change", value: raw.value, color: raw.color }]}
          formatValue={fmt}
          showTotal={false}
        />
      )
    },
    [fmt],
  )

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 18, right: 12, left: 6, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={44}
          />
          <Tooltip content={renderTooltip} />
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="wf" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="top"
              position="top"
              formatter={(_top, _entry, index) => {
                const datum = chartData[index]
                return datum ? fmt(datum.value) : ""
              }}
              fill="hsl(var(--foreground))"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
