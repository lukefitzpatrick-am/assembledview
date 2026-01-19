import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { ResponsiveContainer, Legend, BarChart, CartesianGrid, XAxis, YAxis, Bar } from "recharts"

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(typeof value === "number" ? value : Number(value) || 0)

export type ChannelSpend = {
  channel: string
  spend: number
}

export type MonthlySpendByChannel = {
  month: string
  [channel: string]: string | number
}

type Props = {
  channelData: ChannelSpend[]
  monthlyData: MonthlySpendByChannel[]
  channelColors: Record<string, string>
}

export function SpendChannelCharts({ channelData, monthlyData, channelColors }: Props) {
  const hasChannelData = channelData.length > 0
  const hasMonthlyData = monthlyData.length > 0
  const sortedChannels = [...channelData].sort((a, b) => b.spend - a.spend)
  const monthlyChannelOrder = sortedChannels.map((c) => c.channel)
  const stackedOnePoint = [
    sortedChannels.reduce<Record<string, number>>(
      (acc, cur) => {
        acc[cur.channel] = cur.spend
        return acc
      },
      { label: "" }
    ),
  ]

  const totalChannelSpend = sortedChannels.reduce((sum, entry) => sum + (Number(entry.spend) || 0), 0)

  const ChannelTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs text-muted-foreground">Spend by channel</p>
        {payload.map((item: any) => {
          const value = Number(item.value) || 0
          if (value <= 0) return null
          return (
            <p key={item.name} className="text-sm" style={{ color: item.color }}>
              {item.name}: {formatCurrency(value)}
            </p>
          )
        })}
        <p className="mt-2 border-t pt-2 text-sm font-semibold">Total: {formatCurrency(totalChannelSpend)}</p>
      </div>
    )
  }

  const MonthlyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null
    const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry?.value) || 0), 0)
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        <p className="mb-2 font-semibold">{label}</p>
        {payload.map((entry: any, index: number) => {
          const value = Number(entry?.value) || 0
          if (value <= 0) return null
          return (
            <p key={index} className="text-sm" style={{ color: entry?.color }}>
              {entry?.name}: {formatCurrency(value)}
            </p>
          )
        })}
        <p className="mt-2 border-t pt-2 text-sm font-semibold">Total: {formatCurrency(total)}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-3xl border-muted/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Spend by channel</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {hasChannelData ? (
            <ChartContainer
              config={Object.fromEntries(
                channelData.map((item) => [
                  item.channel,
                  { label: item.channel, color: channelColors[item.channel] ?? "#4f46e5" },
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
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={false} />
                  <ChartTooltip content={<ChannelTooltip />} />
                  <Legend />
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
                    return (
                    <Bar
                      key={entry.channel}
                      dataKey={entry.channel}
                      stackId="1"
                      fill={channelColors[entry.channel] ?? "#4f46e5"}
                      radius={radius}
                      label={{
                        position: "inside",
                        formatter: () => `${pct.toFixed(1)}% • ${entry.channel}`,
                        fill: "#fff",
                        fontSize: 11,
                      }}
                    />
                  )})}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="text-sm text-muted-foreground">No channel data.</div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-muted/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly spend by channel</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {hasMonthlyData ? (
            <ChartContainer
              config={Object.fromEntries(
                Object.keys(channelColors).map((key) => [key, { label: key, color: channelColors[key] }])
              )}
              className="h-[280px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<MonthlyTooltip />} />
                  <Legend />
                  {monthlyChannelOrder.map((channel) => (
                    <Bar
                      key={channel}
                      dataKey={channel}
                      stackId="spend"
                      fill={channelColors[channel]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="text-sm text-muted-foreground">No monthly channel data.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
