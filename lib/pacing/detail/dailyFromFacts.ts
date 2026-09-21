import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"

import type {
  CampaignDetailDailyLineSlice,
  CampaignDetailDailyPoint,
  CampaignDetailDailySeries,
  CampaignDetailDailyTableRow,
  CampaignDetailDailyWindow,
  CampaignDetailMetric,
} from "./types"

export type DailyFactPoint = {
  date: string
  channelKey: string
  channelLabel: string
  lineItemId?: string
  spend: number
  impressions: number
  clicks: number
  views: number
  results?: number
}

export const NO_DAILY_ROWS_MESSAGE = "No daily rows for this campaign"

export { normalizeDailyFactDate }

export function logDailyFactsInput(
  mba: string,
  asOf: string,
  facts: readonly DailyFactPoint[],
): void {
  const byChannel: Record<string, number> = {}
  let min: string | null = null
  let max: string | null = null
  let normalizedCount = 0
  let unparseable = 0
  for (const fact of facts) {
    byChannel[fact.channelKey] = (byChannel[fact.channelKey] ?? 0) + 1
    const date = normalizeDailyFactDate(fact.date)
    if (!date) {
      unparseable += 1
      continue
    }
    normalizedCount += 1
    if (!min || date < min) min = date
    if (!max || date > max) max = date
  }
  console.info("[dailyFromFacts] input", {
    mba,
    asOf,
    factCount: facts.length,
    byChannel,
    dateRange: { min, max },
    normalizedCount,
    unparseable,
  })
}

function metricValue(point: DailyFactPoint, metric: CampaignDetailMetric): number {
  if (metric === "impressions") return point.impressions
  if (metric === "clicks") return point.clicks
  if (metric === "views") return point.views
  return point.spend
}

function inWindow(date: string, window?: CampaignDetailDailyWindow): boolean {
  if (window?.date_from && date < window.date_from) return false
  if (window?.date_to && date > window.date_to) return false
  return true
}

function lineKey(fact: DailyFactPoint): string {
  return (fact.lineItemId ?? fact.channelKey).trim() || fact.channelKey
}

function lineLabel(fact: DailyFactPoint): string {
  const id = fact.lineItemId?.trim()
  if (id) return `${id} · ${fact.channelLabel}`
  return fact.channelLabel
}

export function dailyFromFacts(input: {
  facts: readonly DailyFactPoint[]
  asOf: string
  metric?: CampaignDetailMetric
  planPerDayByChannel?: Record<string, number>
  window?: CampaignDetailDailyWindow
}): {
  series: CampaignDetailDailySeries[]
  metric: CampaignDetailMetric
  table: CampaignDetailDailyTableRow[]
  empty: boolean
} {
  const metric = input.metric ?? "spend"
  const planByChannel = input.planPerDayByChannel ?? {}
  const byDate = new Map<
    string,
    {
      spend: number
      impressions: number
      clicks: number
      views: number
      results: number
      metric: number
      plan: number
      lines: Map<
        string,
        {
          lineItemId: string
          label: string
          spend: number
          impressions: number
          clicks: number
          views: number
          results: number
          value: number
        }
      >
    }
  >()

  for (const fact of input.facts) {
    const date = normalizeDailyFactDate(fact.date)
    if (!date || !inWindow(date, input.window)) continue
    const day = byDate.get(date) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      views: 0,
      results: 0,
      metric: 0,
      plan: 0,
      lines: new Map(),
    }
    const value = metricValue(fact, metric)
    day.spend += fact.spend
    day.impressions += fact.impressions
    day.clicks += fact.clicks
    day.views += fact.views
    day.results += fact.results ?? 0
    day.metric += value
    const key = lineKey(fact)
    const line = day.lines.get(key) ?? {
      lineItemId: key,
      label: lineLabel(fact),
      spend: 0,
      impressions: 0,
      clicks: 0,
      views: 0,
      results: 0,
      value: 0,
    }
    line.spend += fact.spend
    line.impressions += fact.impressions
    line.clicks += fact.clicks
    line.views += fact.views
    line.results += fact.results ?? 0
    line.value += value
    day.lines.set(key, line)
    byDate.set(date, day)
  }

  const dates = [...byDate.keys()].toSorted()
  if (dates.length === 0) {
    return { series: [], metric, table: [], empty: true }
  }

  const combinedPlan = Object.values(planByChannel).reduce((sum, n) => sum + n, 0)
  const points: CampaignDetailDailyPoint[] = dates.map((date) => {
    const day = byDate.get(date)!
    const byLine: CampaignDetailDailyLineSlice[] = [...day.lines.values()]
      .toSorted((a, b) => a.lineItemId.localeCompare(b.lineItemId))
      .map((line) => ({
        lineItemId: line.lineItemId,
        label: line.label,
        value: line.value,
      }))
    return {
      date,
      actual: day.metric,
      plan: combinedPlan,
      byLine,
    }
  })

  const table: CampaignDetailDailyTableRow[] = dates.map((date) => {
    const day = byDate.get(date)!
    return {
      date,
      spend: day.spend,
      impressions: day.impressions,
      clicks: day.clicks,
      views: day.views,
      results: day.results,
      lines: [...day.lines.values()]
        .toSorted((a, b) => a.lineItemId.localeCompare(b.lineItemId))
        .map((line) => ({
          lineItemId: line.lineItemId,
          label: line.label,
          spend: line.spend,
          impressions: line.impressions,
          clicks: line.clicks,
          views: line.views,
          results: line.results,
        })),
    }
  })

  const series: CampaignDetailDailySeries[] = [
    { key: "combined", label: "Combined", points },
  ]
  return { series, metric, table, empty: false }
}
