/**
 * Daily chart rows for the campaign report deck.
 * Series lists come from the dashboard channel charts.
 * Pure: no Snowflake, no React.
 */
import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { addDaysISO, buildDateListISO } from "@/lib/delivery/search/searchCore"
import { cleanPacingLineItemId } from "@/lib/pacing/delivery/lineItemIds"
import { campaignReportChannelLabel } from "@/lib/reports/campaignReport/reportFigures"
import type { PacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import {
  DIRECT_DIGITAL_CLICKS_SERIES,
  DIRECT_DIGITAL_IMPRESSIONS_SERIES,
  PROGRAMMATIC_CHART_SERIES,
  PROGRAMMATIC_CPV_CHART_SERIES,
  SEARCH_CHART_SERIES,
  SOCIAL_CHART_SERIES,
  type ChannelChartSeries,
} from "@/components/dashboard/delivery/channels/channelChartSeries"

export type DeckChartAxis = {
  key: string
  label: string
  format: "money" | "count" | "percent"
}

export type DeckChart = {
  scope: "campaign" | "channel"
  group: string | null
  label: string
  left: DeckChartAxis
  right: DeckChartAxis | null
  points: Array<[string, number, number | null]>
  note: string | null
}

const CAMPAIGN_NOTE = "Reported daily spend. Excludes assumed and estimated spend."
const COMPLETE_DAY_LAG = 2
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const SOCIAL_GROUPS = new Set(["social_meta", "social_tiktok", "social_reddit"])
const PROGRAMMATIC_GROUPS = new Set(["programmatic_display", "programmatic_video", "programmatic_ooh"])
const CM360_GROUPS = new Set(["digital_display", "digital_video", "digital_audio", "bvod"])
const SKIP_GROUPS = new Set(["assumed_spend", "plan_only"])

export type DeckChartSnapshot = {
  channels: DeliveryChannelGroup[]
  dailyPacingRows?: PacingRow[]
  dailySearch?: SearchPacingResponse | null
  includesEstimatedSpend?: boolean
}

export type DeckChartWindow = {
  startISO: string
  endISO: string
}

type DayTotals = { left: number; right: number }

function isCpvBuyType(buyType: string | null | undefined): boolean {
  return String(buyType ?? "").trim().toLowerCase() === "cpv"
}

function seriesForChannel(group: string, lines: DeliveryLineSnapshot[]): ChannelChartSeries[] | null {
  if (SOCIAL_GROUPS.has(group)) return SOCIAL_CHART_SERIES
  if (group === "search") return SEARCH_CHART_SERIES
  if (PROGRAMMATIC_GROUPS.has(group)) {
    const cpv = lines.length > 0 && lines.every((line) => isCpvBuyType(line.buyType))
    return cpv ? PROGRAMMATIC_CPV_CHART_SERIES : PROGRAMMATIC_CHART_SERIES
  }
  if (CM360_GROUPS.has(group)) return [DIRECT_DIGITAL_IMPRESSIONS_SERIES, DIRECT_DIGITAL_CLICKS_SERIES]
  return null
}

function axisFormat(
  format: ChannelChartSeries["format"] | undefined,
  axis: "left" | "right",
): DeckChartAxis["format"] {
  if (format === "percent") return "percent"
  if (format === "dollars") return "money"
  if (format === "number" || format === "compact") return "count"
  return axis === "left" ? "money" : "count"
}

function toAxis(series: ChannelChartSeries): DeckChartAxis {
  return {
    key: series.key,
    label: series.label,
    format: axisFormat(series.format, series.yAxis),
  }
}

function roundAxis(format: DeckChartAxis["format"], value: number): number {
  if (format === "money") return Math.round(value * 100) / 100
  if (format === "count") return Math.round(value)
  return value
}

function pacingMetric(row: PacingRow, key: string): number {
  if (key === "amount_spent") return row.amountSpent || 0
  if (key === "impressions") return row.impressions || 0
  if (key === "clicks") return row.clicks || 0
  if (key === "video_3s_views") return row.video3sViews || 0
  return 0
}

function inWindow(date: string, window: DeckChartWindow): boolean {
  return date >= window.startISO && date <= window.endISO
}

/** Last complete day is two Melbourne calendar days before the window end. */
function chartWindow(window: DeckChartWindow): DeckChartWindow | null {
  const endISO = addDaysISO(window.endISO, -COMPLETE_DAY_LAG)
  if (!endISO || endISO < window.startISO) return null
  return { startISO: window.startISO, endISO }
}

function completeDaysNote(endISO: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endISO)
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  const label = match && month ? `${Number(match[3])} ${month}` : endISO
  return `Chart shows complete days to ${label}.`
}

function chartNote(endISO: string, exclusion: string | null): string {
  const complete = completeDaysNote(endISO)
  return exclusion ? `${exclusion} ${complete}` : complete
}

function addDay(map: Map<string, DayTotals>, date: string, left: number, right: number) {
  const current = map.get(date) ?? { left: 0, right: 0 }
  current.left += left
  current.right += right
  map.set(date, current)
}

function addNumber(map: Map<string, number>, date: string, value: number) {
  map.set(date, (map.get(date) ?? 0) + value)
}

function pointsFrom(
  days: Map<string, DayTotals>,
  window: DeckChartWindow,
  left: DeckChartAxis,
  right: DeckChartAxis | null,
): Array<[string, number, number | null]> | null {
  const dates = [...days.keys()].filter((date) => inWindow(date, window)).sort()
  if (dates.length === 0) return null
  const end = dates[dates.length - 1] < window.endISO ? dates[dates.length - 1] : window.endISO
  return buildDateListISO(window.startISO, end).map((date) => {
    const day = days.get(date)
    const leftValue = roundAxis(left.format, day?.left ?? 0)
    const rightValue = right ? roundAxis(right.format, day?.right ?? 0) : null
    return [date, leftValue, rightValue]
  })
}

function pointsFromNumbers(
  spend: Map<string, number>,
  clicks: Map<string, number>,
  window: DeckChartWindow,
  left: DeckChartAxis,
  right: DeckChartAxis,
): Array<[string, number, number | null]> | null {
  const dates = new Set<string>([...spend.keys(), ...clicks.keys()])
  const inRange = [...dates].filter((date) => inWindow(date, window)).sort()
  if (inRange.length === 0) return null
  const last = inRange[inRange.length - 1]
  const end = last < window.endISO ? last : window.endISO
  return buildDateListISO(window.startISO, end).map((date) => [
    date,
    roundAxis(left.format, spend.get(date) ?? 0),
    roundAxis(right.format, clicks.get(date) ?? 0),
  ])
}

function channelHasAssumedSpend(channel: DeliveryChannelGroup): boolean {
  if (channel.group === "assumed_spend" && channel.totals.spendToDate > 0) return true
  return channel.lines.some(
    (line) =>
      line.spendToDate > 0 && (line.spendMode === "assumed" || line.deliveryState === "assumed"),
  )
}

function channelHasEstimatedSpend(channel: DeliveryChannelGroup): boolean {
  return channel.lines.some((line) => line.spendMode === "estimated" && line.spendToDate > 0)
}

export function buildDeckCharts(snapshot: DeckChartSnapshot, window: DeckChartWindow): DeckChart[] {
  if (!window.startISO || !window.endISO || window.endISO < window.startISO) return []
  const plotted = chartWindow(window)
  if (!plotted) return []

  const lineGroup = new Map<string, string>()
  for (const channel of snapshot.channels) {
    for (const line of channel.lines) {
      const id = cleanPacingLineItemId(line.lineItemId)
      if (!id || lineGroup.has(id)) continue
      lineGroup.set(id, channel.group)
    }
  }

  const channelDays = new Map<string, Map<string, DayTotals>>()
  const campaignSpend = new Map<string, number>()
  const campaignClicks = new Map<string, number>()

  const chartable = new Map<string, ChannelChartSeries[]>()
  for (const channel of snapshot.channels) {
    if (SKIP_GROUPS.has(channel.group)) continue
    if (!(channel.totals.spendToDate > 0)) continue
    const series = seriesForChannel(channel.group, channel.lines)
    if (!series) continue
    chartable.set(channel.group, series)
    channelDays.set(channel.group, new Map())
  }

  const contributesToCampaign = (group: string) =>
    chartable.has(group) && (SOCIAL_GROUPS.has(group) || PROGRAMMATIC_GROUPS.has(group) || group === "search")

  for (const row of snapshot.dailyPacingRows ?? []) {
    const id = cleanPacingLineItemId(row.lineItemId)
    if (!id) continue
    const group = lineGroup.get(id)
    if (!group || group === "search" || !chartable.has(group)) continue
    const date = normalizeDailyFactDate(row.dateDay)
    if (!date || !inWindow(date, plotted)) continue
    const series = chartable.get(group)!
    const left = series.find((item) => item.yAxis === "left")
    const right = series.find((item) => item.yAxis === "right")
    addDay(
      channelDays.get(group)!,
      date,
      left ? pacingMetric(row, left.key) : 0,
      right ? pacingMetric(row, right.key) : 0,
    )
    if (contributesToCampaign(group)) {
      addNumber(campaignSpend, date, row.amountSpent || 0)
      addNumber(campaignClicks, date, row.clicks || 0)
    }
  }

  const searchGroup = chartable.has("search") ? "search" : null
  if (searchGroup) {
    const searchLines = new Set(
      (snapshot.channels.find((channel) => channel.group === "search")?.lines ?? []).flatMap((line) => {
        const id = cleanPacingLineItemId(line.lineItemId)
        return id ? [id] : []
      }),
    )
    for (const series of snapshot.dailySearch?.lineItems ?? []) {
      const id = cleanPacingLineItemId(series.lineItemId)
      if (!id || !searchLines.has(id)) continue
      for (const day of series.daily ?? []) {
        const date = normalizeDailyFactDate(day.date)
        if (!date || !inWindow(date, plotted)) continue
        addDay(channelDays.get("search")!, date, day.cost || 0, day.clicks || 0)
        addNumber(campaignSpend, date, day.cost || 0)
        addNumber(campaignClicks, date, day.clicks || 0)
      }
    }
  }

  const channelCharts: DeckChart[] = []
  for (const channel of snapshot.channels) {
    const series = chartable.get(channel.group)
    if (!series) continue
    const leftSeries = series.find((item) => item.yAxis === "left")
    const rightSeries = series.find((item) => item.yAxis === "right")
    if (!leftSeries) continue
    const left = toAxis(leftSeries)
    const right = rightSeries ? toAxis(rightSeries) : null
    const points = pointsFrom(channelDays.get(channel.group) ?? new Map(), plotted, left, right)
    if (!points) continue
    channelCharts.push({
      scope: "channel",
      group: channel.group,
      label: campaignReportChannelLabel(channel.group),
      left,
      right,
      points,
      note: chartNote(plotted.endISO, null),
    })
  }

  const campaignLeft: DeckChartAxis = { key: "spend", label: "Spend", format: "money" }
  const campaignRight: DeckChartAxis = { key: "clicks", label: "Clicks", format: "count" }
  const campaignPoints = pointsFromNumbers(campaignSpend, campaignClicks, plotted, campaignLeft, campaignRight)
  const hasCm360Chart = channelCharts.some((chart) => chart.group != null && CM360_GROUPS.has(chart.group))
  const hasAssumed = snapshot.channels.some(channelHasAssumedSpend)
  const hasEstimated =
    snapshot.includesEstimatedSpend === true || snapshot.channels.some(channelHasEstimatedSpend)
  const exclusion = hasAssumed || hasEstimated || hasCm360Chart ? CAMPAIGN_NOTE : null
  const note = chartNote(plotted.endISO, exclusion)

  const charts: DeckChart[] = []
  if (campaignPoints) {
    charts.push({
      scope: "campaign",
      group: null,
      label: "All channels",
      left: campaignLeft,
      right: campaignRight,
      points: campaignPoints,
      note,
    })
  }
  charts.push(...channelCharts)
  return charts
}
