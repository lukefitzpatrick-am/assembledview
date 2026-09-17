import type {
  CampaignDetailDailyPoint,
  CampaignDetailDailySeries,
  CampaignDetailMetric,
} from "./types"

export type DailyFactPoint = {
  date: string
  channelKey: string
  channelLabel: string
  spend: number
  impressions: number
  clicks: number
  views: number
}

function metricValue(point: DailyFactPoint, metric: CampaignDetailMetric): number {
  if (metric === "impressions") return point.impressions
  if (metric === "clicks") return point.clicks
  if (metric === "views") return point.views
  return point.spend
}

function lastSixtyDates(asOf: string): string[] {
  const end = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(end)) return []
  const dates: string[] = []
  for (let i = 59; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000)
    dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}

function seriesFor(
  key: string,
  label: string,
  dates: string[],
  actualByDate: Map<string, number>,
  planPerDay: number,
): CampaignDetailDailySeries {
  const points: CampaignDetailDailyPoint[] = dates.map((date) => ({
    date,
    actual: actualByDate.get(date) ?? 0,
    plan: planPerDay,
  }))
  return { key, label, points }
}

export function dailyFromFacts(input: {
  facts: readonly DailyFactPoint[]
  asOf: string
  metric?: CampaignDetailMetric
  planPerDayByChannel?: Record<string, number>
}): { series: CampaignDetailDailySeries[]; metric: CampaignDetailMetric } {
  const metric = input.metric ?? "spend"
  const dates = lastSixtyDates(input.asOf)
  const byChannel = new Map<string, { label: string; actual: Map<string, number> }>()
  const combined = new Map<string, number>()

  for (const fact of input.facts) {
    const value = metricValue(fact, metric)
    const channel = byChannel.get(fact.channelKey) ?? {
      label: fact.channelLabel,
      actual: new Map<string, number>(),
    }
    channel.actual.set(fact.date, (channel.actual.get(fact.date) ?? 0) + value)
    byChannel.set(fact.channelKey, channel)
    combined.set(fact.date, (combined.get(fact.date) ?? 0) + value)
  }

  const planByChannel = input.planPerDayByChannel ?? {}
  const series: CampaignDetailDailySeries[] = [
    seriesFor(
      "combined",
      "Combined",
      dates,
      combined,
      Object.values(planByChannel).reduce((sum, n) => sum + n, 0),
    ),
  ]
  for (const [key, channel] of byChannel) {
    series.push(seriesFor(key, channel.label, dates, channel.actual, planByChannel[key] ?? 0))
  }
  return { series, metric }
}
