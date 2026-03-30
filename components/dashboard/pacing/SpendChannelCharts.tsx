"use client"

import { useMemo } from "react"
import { formatCurrencyAUD } from "@/lib/charts/format"
import { getMediaColor } from "@/lib/charts/registry"
import { CHART_NEUTRAL } from "@/lib/charts/theme"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { ChartShell } from "@/components/charts/ChartShell"
import { useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { ResponsiveContainer, Legend, BarChart, CartesianGrid, XAxis, YAxis, Bar } from "recharts"
import { cn } from "@/lib/utils"

export type ChannelSpend = {
  channel: string
  spend: number
}

export type MonthlySpendByChannel = {
  month: string
  [channel: string]: string | number
}

type SharedInput = {
  channelData: ChannelSpend[]
  monthlyData: MonthlySpendByChannel[]
  /** Optional overrides; otherwise colours come from `getMediaColor` / `getDeterministicColor`. */
  channelColors?: Partial<Record<string, string>>
}

type Props = SharedInput & {
  embedded?: boolean
}

function useResolvedChannelColors(
  channelData: ChannelSpend[],
  monthlyData: MonthlySpendByChannel[],
  channelColors?: Partial<Record<string, string>>
): Record<string, string> {
  return useMemo(() => {
    const base: Record<string, string> = {}
    for (const { channel } of channelData) {
      base[channel] = getMediaColor(channel)
    }
    for (const row of monthlyData) {
      for (const key of Object.keys(row)) {
        if (key === "month") continue
        if (base[key]) continue
        base[key] = getMediaColor(key)
      }
    }
    const merged: Record<string, string> = { ...base }
    if (channelColors) {
      for (const [k, v] of Object.entries(channelColors)) {
        if (v) merged[k] = v
      }
    }
    return merged
  }, [channelData, monthlyData, channelColors])
}

export function ChannelSpendChartBody({
  channelData,
  channelColors,
  showLegend = true,
}: {
  channelData: ChannelSpend[]
  channelColors: Record<string, string>
  showLegend?: boolean
}) {
  const hasChannelData = channelData.length > 0
  const sortedChannels = [...channelData].sort((a, b) => b.spend - a.spend)
  const stackedOnePoint = [
    sortedChannels.reduce<MonthlySpendByChannel>(
      (acc, cur) => {
        acc[cur.channel] = cur.spend
        return acc
      },
      { month: "" }
    ),
  ]

  const renderTooltip = useUnifiedTooltip({
    formatValue: formatCurrencyAUD,
    showTotal: true,
    formatLabel: (l) => (l && String(l).trim() ? String(l) : "Spend by channel"),
  })

  if (!hasChannelData) {
    return <div className="text-sm text-muted-foreground">No channel data.</div>
  }

  return (
    <ChartContainer
      config={Object.fromEntries(
        channelData.map((item) => [
          item.channel,
          { label: item.channel, color: channelColors[item.channel] ?? getMediaColor(item.channel) },
        ])
      )}
      className="h-[320px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stackedOnePoint}
          layout="vertical"
          stackOffset="expand"
          margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} stroke="hsl(var(--muted-foreground))" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis type="category" dataKey="month" tickLine={false} axisLine={false} tick={false} />
          <ChartTooltip content={renderTooltip} />
          {showLegend ? <Legend wrapperStyle={{ cursor: "default" }} /> : null}
          {sortedChannels.map((entry, idx) => {
            const total = sortedChannels.reduce((sum, c) => sum + c.spend, 0)
            const pct = total ? (entry.spend / total) * 100 : 0
            const isFirst = idx === 0
            const isLast = idx === sortedChannels.length - 1
            const radius: [number, number, number, number] = [
              isFirst ? 12 : 0,
              isLast ? 12 : 0,
              isLast ? 12 : 0,
              isFirst ? 12 : 0,
            ]
            const fill = channelColors[entry.channel] ?? getMediaColor(entry.channel)
            return (
              <Bar
                key={entry.channel}
                dataKey={entry.channel}
                stackId="1"
                fill={fill}
                radius={radius}
                cursor="default"
                label={{
                  position: "inside",
                  formatter: () => `${pct.toFixed(1)}% • ${entry.channel}`,
                  fill: CHART_NEUTRAL.labelOnDark,
                  fontSize: 11,
                }}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

export function MonthlySpendChartBody({
  monthlyData,
  channelData,
  channelColors,
  showLegend = true,
}: {
  monthlyData: MonthlySpendByChannel[]
  channelData: ChannelSpend[]
  channelColors: Record<string, string>
  showLegend?: boolean
}) {
  const hasMonthlyData = monthlyData.length > 0
  const sortedChannels = [...channelData].sort((a, b) => b.spend - a.spend)
  const monthlyChannelOrder = sortedChannels.map((c) => c.channel)

  const renderTooltip = useUnifiedTooltip({
    formatValue: formatCurrencyAUD,
    showTotal: true,
  })

  if (!hasMonthlyData) {
    return <div className="text-sm text-muted-foreground">No monthly channel data.</div>
  }

  return (
    <ChartContainer
      config={Object.fromEntries(
        monthlyChannelOrder.map((key) => [key, { label: key, color: channelColors[key] ?? getMediaColor(key) }])
      )}
      className="h-[280px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthlyData} margin={{ left: 4, right: 12 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} stroke="hsl(var(--muted-foreground))" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <ChartTooltip content={renderTooltip} />
          {showLegend ? <Legend wrapperStyle={{ cursor: "default" }} /> : null}
          {monthlyChannelOrder.map((channel) => (
            <Bar
              key={channel}
              dataKey={channel}
              stackId="spend"
              fill={channelColors[channel] ?? getMediaColor(channel)}
              radius={[4, 4, 0, 0]}
              cursor="default"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

export function SpendChannelCharts({ channelData, monthlyData, channelColors, embedded = false }: Props) {
  const resolved = useResolvedChannelColors(channelData, monthlyData, channelColors)

  const shellClass = embedded ? "shadow-none" : undefined

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", embedded && "gap-4")}>
      <ChartShell title="Spend by channel" showExport={false} chartAreaClassName="h-[320px]" className={shellClass}>
        <ChannelSpendChartBody channelData={channelData} channelColors={resolved} />
      </ChartShell>
      <ChartShell title="Monthly spend by channel" showExport={false} chartAreaClassName="h-[280px]" className={shellClass}>
        <MonthlySpendChartBody monthlyData={monthlyData} channelData={channelData} channelColors={resolved} />
      </ChartShell>
    </div>
  )
}
