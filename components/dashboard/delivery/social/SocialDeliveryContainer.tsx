"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@/components/AuthWrapper"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Area, CartesianGrid, XAxis, YAxis, LineChart, Line, ReferenceLine, Tooltip } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { SmallProgressCard } from "@/components/dashboard/delivery/SmallProgressCard"
import { DeliveryCard, DeliverySubCard } from "@/components/dashboard/delivery/DeliveryCard"
import { ActualsCumulativeVsTargetChart } from "@/components/dashboard/delivery/common/ActualsCumulativeVsTargetChart"
import { UnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import {
  PacingResult,
  PacingSeriesPoint,
  getDeliverableKey,
} from "@/lib/pacing/calcPacing"
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric"
import type { ActualsDaily, BuyType, Burst } from "@/lib/pacing/mockMetaPacing"
import {
  MetaPacingRow,
  normalisePlatform,
  summariseDelivery,
} from "@/lib/pacing/social/metaPacing"
import { downloadCSV } from "@/lib/utils/csv-export"
import { CHART_NEUTRAL } from "@/lib/charts/theme"
import { assignEntityColors } from "@/lib/charts/registry"
import { PACING_CHART_STROKE } from "@/lib/charts/dashboardTheme"
import { PACING_CARTESIAN_GRID_PROPS, PACING_TODAY_REFERENCE_LINE_PROPS } from "@/lib/charts/pacingLineChartStyle"
import { pacingDeviationBorderClass, pacingDeviationSparklineClass } from "@/lib/pacing/pacingDeviationStyle"
import { cn } from "@/lib/utils"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { useToast } from "@/components/ui/use-toast"
import { useChartExport } from "@/hooks/useChartExport"
import { Sparkline } from "@/components/charts/Sparkline"
import { DeliveryStatusBadge } from "@/components/dashboard/delivery/DeliveryStatusBadge"
import { PacingStatusBadge } from "@/components/dashboard/PacingStatusBadge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Copy,
  FileSpreadsheet,
  ImageDown,
  LayoutDashboard,
  LineChart as LineChartIcon,
  MessageCircleMore,
  Music2,
  RefreshCw,
  Table,
} from "lucide-react"
import { getMelbourneTodayISO, getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import {
  buildCumulativeTargetCurve,
  buildCumulativeActualSeries,
  evaluateOnTrack,
  type TargetCurveLineItem,
  type TargetCurvePoint,
  type OnTrackStatus,
} from "@/lib/kpi/deliveryTargetCurve"

type SocialLineItem = {
  line_item_id: string
  line_item_name?: string
  buy_type?: string
  platform?: string
  bursts?: Burst[]
  bursts_json?: string | Burst[]
  total_budget?: number
  deliverables_total?: number
  goal_deliverable_total?: number
  fixed_cost_media?: boolean
  [key: string]: any
}

type SocialDeliveryContainerProps = {
  clientSlug: string
  mbaNumber: string
  socialLineItems?: SocialLineItem[]
  snowflakeDeliveryRows?: MetaPacingRow[]
  campaignStart: string
  campaignEnd: string
  initialPacingRows?: CombinedPacingRow[]
  deliveryLineItemIds?: string[]
  brandColour?: string
  /**
   * When true (default), use client-facing Delivery copy. The agency `/pacing` route
   * passes false so Pacing language is preserved.
   */
  clientFacingLabels?: boolean
  kpiTargets?: KPITargetsMap
}

type LineItemMetrics = {
  lineItem: SocialLineItem
  pacing: PacingResult
  bursts: Burst[]
  window: { startISO?: string; endISO?: string; startDate: Date | null; endDate: Date | null }
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[]
  matchedRows: MetaPacingRow[]
  matchBreakdown: { targetId: string | null; byId: number; platform: string | null }
  booked: { spend: number; deliverables: number }
  delivered: { spend: number; deliverables: number }
  shouldToDate: { spend: number; deliverables: number }
  deliverableKey: ReturnType<typeof resolveDeliverableKey>
  targetMetric: "clicks" | "views" | null
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  onTrackStatus: OnTrackStatus
}

const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const IS_DEV = process.env.NODE_ENV !== "production"

function isMetaPlatform(value: string | undefined) {
  if (!value) return false
  const lower = String(value).toLowerCase()
  return /\b(meta|facebook|instagram|ig)\b/.test(lower)
}

function isTikTokPlatform(value: string | undefined) {
  if (!value) return false
  const lower = String(value).toLowerCase()
  return /\btik\s*tok\b/.test(lower)
}

const cleanId = (v: any) => {
  const s = String(v ?? "").trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === "undefined" || lower === "null") return null
  return lower
}
const getRowLineItemId = (row: any): string | null => {
  return cleanId(row?.lineItemId ?? row?.LINE_ITEM_ID ?? row?.line_item_id)
}
const round2 = (n: number) => Number((n || 0).toFixed(2))

async function parseSocialPacingResponseJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    const text = await response.text()
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.slice(0, 200)}`)
  }
  return response.json()
}

function mapCombinedRowToMeta(row: CombinedPacingRow): MetaPacingRow {
  return {
    channel: row.channel as any,
    dateDay: row.dateDay,
    adsetName: row.adsetName ?? "",
    lineItemId: row.lineItemId ?? undefined,
    campaignId: row.campaignId ?? undefined,
    campaignName: row.campaignName ?? undefined,
    adsetId: row.adsetId ?? undefined,
    amountSpent: row.amountSpent ?? 0,
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    results: row.results ?? 0,
    video3sViews: row.video3sViews ?? 0,
  }
}

function classifyPlatform(platformValue: unknown, fallbackName: string | null | undefined): "meta" | "tiktok" | null {
  const platform = String(platformValue ?? "").trim()
  if (platform) {
    if (isMetaPlatform(platform)) return "meta"
    if (isTikTokPlatform(platform)) return "tiktok"
  }

  const name = String(fallbackName ?? "").trim()
  if (name) {
    const upper = name.toUpperCase()
    if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(upper)) return "meta"
    if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(upper)) return "tiktok"
  }

  return null
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function toISO(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10)
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function eachDay(start: Date, end: Date): string[] {
  const dates: string[] = []
  const cursor = startOfDay(start)
  const endDate = startOfDay(end)
  while (cursor <= endDate) {
    dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function inclusiveDays(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = endOfDay(end).getTime() - startOfDay(start).getTime()
  if (diff < 0) return 0
  return Math.floor(diff / msPerDay) + 1
}

function parseCurrency(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "")
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function sumBookedFromBursts(bursts: Burst[]) {
  return bursts.reduce(
    (acc, burst) => {
      const spend = parseCurrency(
        burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? 0
      )
      const deliverables = parseCurrency(
        (burst as any).calculated_value_number ?? (burst as any).deliverables ?? 0
      )

      return {
        spend: acc.spend + spend,
        deliverables: acc.deliverables + deliverables,
      }
    },
    { spend: 0, deliverables: 0 }
  )
}

function sumDeliveredUpToDate(
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[],
  deliverableKey: ReturnType<typeof getDeliverableKey> | "deliverable_value" | null,
  asAtISO?: string | null
) {
  const cutoff = asAtISO ?? null
  return actualsDaily.reduce(
    (acc, day) => {
      if (cutoff && day.date > cutoff) return acc
      const deliverableValue =
        deliverableKey && deliverableKey !== "deliverable_value"
          ? (day as any)[deliverableKey] ?? 0
          : (day as any).deliverable_value ?? (day as any).results ?? 0

      return {
        spend: acc.spend + (day.spend ?? 0),
        deliverables: acc.deliverables + (deliverableValue ?? 0),
      }
    },
    { spend: 0, deliverables: 0 }
  )
}

function normalizeBurst(raw: Record<string, any>): Burst {
  const startDate =
    raw.start_date || raw.startDate || raw.start || raw.beginDate || raw.begin_date || ""
  const endDate = raw.end_date || raw.endDate || raw.end || raw.stopDate || raw.stop_date || ""

  const budgetNumber = parseCurrency(
    raw.budget_number ??
      raw.budget ??
      raw.media_investment ??
      raw.mediaInvestment ??
      raw.buy_amount_number ??
      raw.buyAmount
  )
  const buyAmountNumber = parseCurrency(raw.buy_amount_number ?? raw.buy_amount ?? raw.buyAmount)
  const calculatedValueNumber = parseCurrency(
    raw.calculated_value_number ?? raw.calculatedValue ?? raw.deliverables ?? raw.deliverable
  )

  const mediaInvestment =
    typeof raw.media_investment === "number"
      ? raw.media_investment
      : budgetNumber || buyAmountNumber
  const deliverables =
    typeof raw.deliverables === "number" || typeof raw.deliverable === "number"
      ? raw.deliverables ?? raw.deliverable
      : calculatedValueNumber

  return {
    start_date: startDate,
    end_date: endDate,
    startDate,
    endDate,
    media_investment: Number.isFinite(mediaInvestment) ? mediaInvestment : 0,
    deliverables: Number.isFinite(deliverables) ? deliverables : 0,
    budget_number: Number.isFinite(budgetNumber) ? budgetNumber : 0,
    buy_amount_number: Number.isFinite(buyAmountNumber) ? buyAmountNumber : 0,
    calculated_value_number: Number.isFinite(calculatedValueNumber) ? calculatedValueNumber : 0,
  }
}

function parseBursts(raw: SocialLineItem["bursts"] | SocialLineItem["bursts_json"]): Burst[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((b) => normalizeBurst(b as Record<string, any>))
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.map((b) => normalizeBurst(b as Record<string, any>))
        : []
    } catch {
      return []
    }
  }
  return []
}


function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

function formatCurrency2dp(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-AU")
}

function formatWholeNumber(value: number | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-AU")
}

function formatDateAU(dateString: string | undefined) {
  if (!dateString) return "—"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function formatChartDateLabel(iso: string | undefined) {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" }).format(d)
}

function formatCompactNumber(value: number | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat("en-AU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

function formatLineItemHeader(lineItem: SocialLineItem) {
  const platform = String(lineItem.platform ?? "").trim()
  const targeting = String((lineItem as any).creative_targeting ?? "").trim()
  const parts = [platform, targeting].filter(Boolean)
  if (parts.length) return parts.join(" • ")
  return lineItem.line_item_name || lineItem.line_item_id || "Line item"
}

function getLineItemNameCandidate(item: SocialLineItem) {
  return (
    item.line_item_name ??
    (item as any).lineItemName ??
    (item as any).creative_targeting ??
    (item as any).creative ??
    ""
  )
}

function resolveDeliverableKey(
  buyType: string | undefined,
  platform?: string | undefined
): ReturnType<typeof getDeliverableKey> {
  const metric = mapDeliverableMetric({ channel: "social", buyType, platform })
  switch (metric) {
    case "VIDEO_3S_VIEWS":
      return "video_3s_views"
    case "RESULTS":
      return "results"
    case "CLICKS":
      return "clicks"
    case "IMPRESSIONS":
    default:
      return "impressions"
  }
}

/**
 * Map a social line item's deliverable key to the TargetCurve metric.
 * Returns null when the metric has no KPI target (e.g. impressions, which
 * aren't in the KPI tuple today).
 */
function targetMetricForDeliverableKey(
  deliverableKey: ReturnType<typeof resolveDeliverableKey>,
): "clicks" | "views" | null {
  switch (deliverableKey) {
    case "clicks":
      return "clicks"
    case "video_3s_views":
      return "views"
    case "results":
      return null
    case "impressions":
    default:
      return null
  }
}

/**
 * Build a TargetCurveLineItem for a social line item. Returns null when the
 * deliverable key doesn't map to a KPI metric or when deliverables = 0.
 */
function buildSocialTargetCurveLineItem(item: SocialLineItem, bursts: Burst[]): TargetCurveLineItem | null {
  const publisher = String(
    item?.platform ?? (item as any)?.site ?? (item as any)?.publisher ?? "",
  )
    .trim()
    .toLowerCase()
  const bidStrategy = String(
    (item as any)?.bid_strategy ?? (item as any)?.bidStrategy ?? item?.buy_type ?? "",
  )
    .trim()
    .toLowerCase()
  const buyType = String(item?.buy_type ?? "").trim().toLowerCase()

  const explicitDeliverables =
    Number(item?.goal_deliverable_total ?? item?.deliverables_total ?? 0) || 0
  const burstDeliverables = bursts.reduce(
    (sum, b) => sum + (Number((b as any)?.deliverables ?? (b as any)?.deliverablesAmount ?? 0) || 0),
    0,
  )
  const deliverables = explicitDeliverables > 0 ? explicitDeliverables : burstDeliverables
  if (deliverables <= 0) return null

  let earliestStartISO: string | null = null
  let latestEndISO: string | null = null
  for (const b of bursts) {
    const start =
      (b as any).startISO ??
      (b as any).start ??
      (b as any).startDate ??
      (b as any).start_date ??
      null
    const end =
      (b as any).endISO ?? (b as any).end ?? (b as any).endDate ?? (b as any).end_date ?? null
    if (start && (!earliestStartISO || start < earliestStartISO)) earliestStartISO = start
    if (end && (!latestEndISO || end > latestEndISO)) latestEndISO = end
  }

  return {
    mediaType: "socialmedia",
    publisher,
    bidStrategy,
    buyType,
    deliverables,
    earliestStartISO,
    latestEndISO,
  }
}

function getDeliverableLabel(deliverableKey: ReturnType<typeof getDeliverableKey> | null) {
  switch (deliverableKey) {
    case "clicks":
      return "Clicks"
    case "results":
      return "Conversions"
    case "video_3s_views":
      return "Video Views"
    case "impressions":
    default:
      return "Impressions"
  }
}

function normalizeLineItems(lineItems: SocialLineItem[]) {
  return lineItems.map((item) => {
    const bursts = parseBursts(item.bursts || item.bursts_json)
    const budget =
      item.total_budget ??
      item.budget ??
      bursts.reduce(
        (sum, b) => sum + (b.budget_number ?? b.media_investment ?? b.buy_amount_number ?? 0),
        0
      )
    const deliverableTotal =
      item.goal_deliverable_total ??
      item.deliverables_total ??
      bursts.reduce(
        (sum, b) => sum + (b.calculated_value_number ?? b.deliverables ?? 0),
        0
      )

    return {
      ...item,
      bursts,
      total_budget: budget,
      goal_deliverable_total: deliverableTotal,
    }
  })
}

function resolveLineItemRange(
  item: SocialLineItem,
  fallbackStart?: string,
  fallbackEnd?: string
) {
  const bursts = item.bursts ?? parseBursts(item.bursts_json)
  const dates: string[] = []
  bursts.forEach((burst) => {
    if (burst.start_date) dates.push(burst.start_date)
    if (burst.end_date) dates.push(burst.end_date)
  })

  const start =
    (dates.length ? dates.sort()[0] : null) ??
    item.start_date ??
    item.startDate ??
    item.start ??
    fallbackStart
  const end =
    (dates.length ? dates.sort().slice(-1)[0] : null) ??
    item.end_date ??
    item.endDate ??
    item.end ??
    fallbackEnd

  return { start, end, bursts }
}

function getLineItemWindow(bursts: Burst[], fallbackStart?: string, fallbackEnd?: string) {
  const starts: Date[] = []
  const ends: Date[] = []

  bursts.forEach((burst) => {
    const s = parseDateSafe(burst.start_date)
    const e = parseDateSafe(burst.end_date)
    if (s) starts.push(s)
    if (e) ends.push(e)
  })

  const fallbackStartDate = parseDateSafe(fallbackStart ?? undefined)
  const fallbackEndDate = parseDateSafe(fallbackEnd ?? undefined)

  const startDate = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : fallbackStartDate
  const endDate = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : fallbackEndDate

  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    startISO: startDate ? toISO(startDate) : undefined,
    endISO: endDate ? toISO(endDate) : undefined,
  }
}

function computeShouldToDateFromBursts(
  bursts: Burst[],
  asAtISO: string,
  kind: "spend" | "deliverables"
) {
  const asAtDate = parseDateSafe(asAtISO)
  if (!asAtDate) return 0

  return bursts.reduce((sum, burst) => {
    const burstStart = parseDateSafe(burst.start_date)
    const burstEnd = parseDateSafe(burst.end_date)
    if (!burstStart || !burstEnd) return sum

    const total =
      kind === "spend"
        ? burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? 0
        : (burst as any).calculated_value_number ?? (burst as any).deliverables ?? 0

    const duration = inclusiveDays(burstStart, burstEnd)
    if (duration <= 0) return sum

    if (asAtDate < burstStart) return sum
    const elapsedEnd = asAtDate > burstEnd ? burstEnd : asAtDate
    const elapsed = inclusiveDays(burstStart, elapsedEnd)
    const should = (total / duration) * elapsed
    return sum + should
  }, 0)
}

function buildCumulativeSeries(
  dates: string[],
  actualsDaily: (ActualsDaily & { deliverable_value?: number })[],
  deliverableKey: ReturnType<typeof getDeliverableKey> | "deliverable_value" | null
): PacingSeriesPoint[] {
  const actualMap = new Map<string, (ActualsDaily & { deliverable_value?: number })>()
  actualsDaily.forEach((day) => actualMap.set(day.date, day))

  return dates.map((date) => {
    const day = actualMap.get(date)
    const spend = day?.spend ?? 0
    const deliverableValue =
      deliverableKey && deliverableKey !== "deliverable_value"
        ? (day as any)?.[deliverableKey] ?? 0
        : day?.deliverable_value ?? (day as any)?.results ?? 0

    return {
      date,
      expectedSpend: 0,
      actualSpend: Number(spend.toFixed(2)),
      expectedDeliverable: 0,
      actualDeliverable: Number(deliverableValue.toFixed(2)),
    }
  })
}


function buildAggregatedMetrics(
  lineItemMetrics: LineItemMetrics[],
  asAtDate: string | undefined,
  campaignStartISO: string,
  campaignEndISO: string
): LineItemMetrics["pacing"] {
  const cs = parseDateSafe(campaignStartISO)
  const ce = parseDateSafe(campaignEndISO)
  if (!cs || !ce) {
    return {
      asAtDate: asAtDate ?? null,
      spend: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      deliverable: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      series: [],
    }
  }

  const dateRange = eachDay(cs, ce)

  const actualMap = new Map<string, { spend: number; deliverable: number }>()
  lineItemMetrics.forEach((metric) => {
    metric.actualsDaily.forEach((day) => {
      const deliverableValue = day.deliverable_value ?? (day as any).results ?? 0
      const existing = actualMap.get(day.date) ?? { spend: 0, deliverable: 0 }
      actualMap.set(day.date, {
        spend: existing.spend + (day.spend ?? 0),
        deliverable: existing.deliverable + (deliverableValue ?? 0),
      })
    })
  })

  const aggregateActuals = dateRange.map((date) => {
    const values = actualMap.get(date) ?? { spend: 0, deliverable: 0 }
    return {
      date,
      spend: Number(values.spend.toFixed(2)),
      impressions: 0,
      clicks: 0,
      results: Number(values.deliverable.toFixed(2)),
      video_3s_views: 0,
      deliverable_value: Number(values.deliverable.toFixed(2)),
    }
  })

  const asAt = asAtDate ?? null
  const delivered = sumDeliveredUpToDate(aggregateActuals, "deliverable_value", asAt)

  const bookedTotals = {
    spend: round2(lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0)),
    deliverables: round2(
      lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0)
    ),
  }

  const shouldAt = asAt ?? campaignEndISO
  const shouldSpend = round2(
    lineItemMetrics.reduce(
      (sum, m) => sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "spend"),
      0
    )
  )
  const shouldDeliverables = round2(
    lineItemMetrics.reduce(
      (sum, m) =>
        sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "deliverables"),
      0
    )
  )

  const spendPacing = shouldSpend > 0 ? (delivered.spend / shouldSpend) * 100 : 0
  const deliverablePacing =
    shouldDeliverables > 0 ? (delivered.deliverables / shouldDeliverables) * 100 : 0

  return {
    asAtDate: asAt ?? null,
    spend: {
      actualToDate: round2(delivered.spend),
      expectedToDate: shouldSpend,
      delta: round2(delivered.spend - shouldSpend),
      pacingPct: round2(spendPacing),
      goalTotal: bookedTotals.spend,
    },
    deliverable: {
      actualToDate: round2(delivered.deliverables),
      expectedToDate: shouldDeliverables,
      delta: round2(delivered.deliverables - shouldDeliverables),
      pacingPct: round2(deliverablePacing),
      goalTotal: bookedTotals.deliverables,
    },
    series: buildCumulativeSeries(dateRange, aggregateActuals, "deliverable_value"),
  }
}

function ActualsDailyDeliveryChart({
  series,
  asAtDate,
  deliverableLabel,
  chartRef,
  platform: _platform = "meta",
  brandColour,
}: {
  series: PacingSeriesPoint[]
  asAtDate: string | null
  deliverableLabel: string
  chartRef?: React.Ref<HTMLDivElement>
  platform?: "meta" | "tiktok" | "mixed"
  brandColour?: string
}) {
  const refLineISO = asAtDate ?? getMelbourneTodayISO()
  const showTodayLine = useMemo(() => Boolean(refLineISO && series.some((p) => p.date === refLineISO)), [series, refLineISO])
  const indexByDate = useMemo(() => {
    const m = new Map<string, number>()
    series.forEach((row, i) => m.set(String(row.date), i))
    return m
  }, [series])
  const targetDeliverables = useMemo(() => {
    const latest = series[series.length - 1]
    return Number(latest?.expectedDeliverable ?? 0) || null
  }, [series])
  const { spendColor, deliverableColor } = useMemo(() => {
    const spendName = "Actual spend"
    const delName = `${deliverableLabel} actual`
    const m = assignEntityColors([spendName, delName], "generic")
    return {
      spendColor: brandColour ?? m.get(spendName)!,
      deliverableColor: m.get(delName)!,
    }
  }, [deliverableLabel, brandColour])

  return (
    <div className="space-y-2">
      <ChartContainer
        config={{
          spendActual: { label: "Actual spend", color: spendColor },
          deliverableActual: { label: `${deliverableLabel} actual`, color: deliverableColor },
          expectedSpend: { label: "Expected spend", color: PACING_CHART_STROKE.expected },
          expectedDeliverable: { label: `Expected ${deliverableLabel}`, color: PACING_CHART_STROKE.expected },
        }}
        className="h-[320px] w-full"
        ref={chartRef}
      >
        <LineChart data={series} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="social-spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={spendColor} stopOpacity={0.22} />
            <stop offset="95%" stopColor={spendColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="social-deliverable-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={deliverableColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={deliverableColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...PACING_CARTESIAN_GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          angle={series.length > 10 ? -45 : 0}
          textAnchor={series.length > 10 ? "end" : "middle"}
          height={series.length > 10 ? 56 : 30}
          tickFormatter={(v) => formatChartDateLabel(String(v))}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatCompactNumber(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatCompactNumber(v)}
        />
        <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
        <Area type="monotone" yAxisId="left" dataKey="actualSpend" fill="url(#social-spend-fill)" stroke="none" />
        <Area type="monotone" yAxisId="right" dataKey="actualDeliverable" fill="url(#social-deliverable-fill)" stroke="none" />
        <Line
          type="monotone"
          yAxisId="left"
          dataKey="actualSpend"
          name="Actual spend"
          stroke={spendColor}
          strokeWidth={2.5}
          dot={false}
          cursor="default"
          activeDot={{ r: 4, stroke: spendColor, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
        />
        <Line
          type="monotone"
          yAxisId="right"
          dataKey="actualDeliverable"
          name={`${deliverableLabel} actual`}
          stroke={deliverableColor}
          strokeWidth={2.5}
          dot={false}
          cursor="default"
          activeDot={{ r: 4, stroke: deliverableColor, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
        />
        <Line
          type="monotone"
          yAxisId="left"
          dataKey="expectedSpend"
          name="Expected spend"
          stroke={PACING_CHART_STROKE.expected}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          yAxisId="right"
          dataKey="expectedDeliverable"
          name={`Expected ${deliverableLabel}`}
          stroke={PACING_CHART_STROKE.expected}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          connectNulls
        />
        {showTodayLine ? (
          <ReferenceLine yAxisId="left" x={refLineISO} {...PACING_TODAY_REFERENCE_LINE_PROPS} />
        ) : null}
        {targetDeliverables ? (
          <ReferenceLine
            yAxisId="right"
            y={targetDeliverables}
            stroke={PACING_CHART_STROKE.expected}
            strokeDasharray="3 3"
            label={{ value: "Target deliverables", position: "insideTopRight", fontSize: 10 }}
          />
        ) : null}
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const date = String(label ?? "")
            const idx = indexByDate.get(date)
            const point = payload[0].payload as PacingSeriesPoint
            const previous = typeof idx === "number" && idx > 0 ? series[idx - 1] : undefined
            const currentTotal = Number(point.actualSpend ?? 0) + Number(point.actualDeliverable ?? 0)
            const prevTotal = previous
              ? Number(previous.actualSpend ?? 0) + Number(previous.actualDeliverable ?? 0)
              : undefined
            return (
              <UnifiedTooltip
                active={Boolean(active)}
                label={date}
                formatLabel={(l) => formatChartDateLabel(l)}
                payload={[
                  {
                    name: "Actual spend",
                    value: Number(point.actualSpend ?? 0),
                    color: spendColor,
                    dataKey: "actualSpend",
                  },
                  {
                    name: `${deliverableLabel} actual`,
                    value: Number(point.actualDeliverable ?? 0),
                    color: deliverableColor,
                    dataKey: "actualDeliverable",
                  },
                ]}
                formatValue={(v) => formatCompactNumber(v)}
                showPercentages={false}
                comparison={
                  typeof prevTotal === "number"
                    ? {
                        value: prevTotal,
                        label: previous
                          ? "vs previous day"
                          : asAtDate
                            ? `As at ${asAtDate}`
                            : "vs previous day",
                      }
                    : undefined
                }
              />
            )
          }}
        />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">Read-only chart: hover lines and legend for details.</p>
    </div>
  )
}

function DeliveryTable({
  daily,
}: {
  daily: Array<{
    date: string
    spend: number
    impressions: number
    clicks: number
    results: number
    video_3s_views: number
    deliverable_value?: number
  }>
}) {
  if (!daily.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        No daily delivery data available
      </div>
    )
  }

  const COLS = "120px 120px 140px 120px 120px 120px 120px"

  const sorted = [...daily].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const totals = sorted.reduce(
    (acc, row) => ({
      spend: acc.spend + (row.spend ?? 0),
      deliverables: acc.deliverables + (row.deliverable_value ?? row.results ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      results: acc.results + (row.results ?? 0),
      video3sViews: acc.video3sViews + ((row as any).video3sViews ?? row.video_3s_views ?? 0),
    }),
    { spend: 0, deliverables: 0, impressions: 0, clicks: 0, results: 0, video3sViews: 0 }
  )

  return (
    <div className="max-h-[420px] overflow-auto">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-3 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Date</div>
            <div className="text-right">Spend</div>
            <div className="text-right">Deliverables</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">Results</div>
            <div className="text-right">3s Views</div>
          </div>
        </div>

        {sorted.map((row, i) => {
          const deliverables = row.deliverable_value ?? row.results ?? 0
          const video3sViews = (row as any).video3sViews ?? row.video_3s_views ?? 0
          return (
            <div
              key={String(row.date)}
              className={cn(
                "grid items-center border-b px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-muted/30",
                i % 2 === 1 ? "bg-muted/15" : "bg-background"
              )}
              style={{ gridTemplateColumns: COLS }}
            >
              <div className="font-medium">{formatDateAU(row.date)}</div>
              <div className="text-right">{formatCurrency(row.spend)}</div>
              <div className="text-right">{formatWholeNumber(deliverables)}</div>
              <div className="text-right">{formatNumber(row.impressions)}</div>
              <div className="text-right">{formatNumber(row.clicks)}</div>
              <div className="text-right">{formatNumber(row.results)}</div>
              <div className="text-right">{formatNumber(video3sViews)}</div>
            </div>
          )
        })}

        <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/95 px-3 py-2 text-sm font-semibold backdrop-blur">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Totals</div>
            <div className="text-right">{formatCurrency(totals.spend)}</div>
            <div className="text-right">{formatWholeNumber(totals.deliverables)}</div>
            <div className="text-right">{formatNumber(totals.impressions)}</div>
            <div className="text-right">{formatNumber(totals.clicks)}</div>
            <div className="text-right">{formatNumber(totals.results)}</div>
            <div className="text-right">{formatNumber(totals.video3sViews)}</div>
          </div>
        </div>
    </div>
  )
}

type ActualKpis = {
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
  cpm: number
  ctr: number
  cvr: number
  cpc: number
  cost_per_result: number
  cpv: number
  view_rate: number
}

function summarizeActuals(rows: (ActualsDaily | (ActualsDaily & { video3sViews?: number }))[]): ActualKpis {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += row.spend
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      acc.results += row.results
      acc.video_3s_views += (row as any).video_3s_views ?? (row as any).video3sViews ?? 0
      return acc
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }
  )

  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cvr = totals.impressions ? (totals.results / totals.impressions) * 100 : 0
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cost_per_result = totals.results ? totals.spend / totals.results : 0
  const cpv = totals.video_3s_views ? totals.spend / totals.video_3s_views : 0
  const view_rate = totals.impressions
    ? (totals.video_3s_views / totals.impressions) * 100
    : 0

  return {
    ...totals,
    cpm,
    ctr,
    cvr,
    cpc,
    cost_per_result,
    cpv,
    view_rate,
  }
}

function KpiCallouts({ totals }: { totals: ActualKpis }) {
  const cards: Array<{
    label: string
    value: string
    pill1Label: string
    pill1Value: string
    pill1Danger?: boolean
    pill2Label: string
    pill2Value: string
    pill2Danger?: boolean
  }> = [
    {
      label: "Impressions",
      value: formatNumber(totals.impressions),
      pill1Label: "CPM",
      pill1Value: formatCurrency2dp(totals.cpm),
      pill1Danger: totals.cpm > 15,
      pill2Label: "CTR",
      pill2Value: formatPercent(totals.ctr),
      pill2Danger: totals.ctr < 0.1,
    },
    {
      label: "Clicks",
      value: formatNumber(totals.clicks),
      pill1Label: "CTR",
      pill1Value: formatPercent(totals.ctr),
      pill1Danger: totals.ctr < 0.1,
      pill2Label: "CPC",
      pill2Value: formatCurrency2dp(totals.cpc),
      pill2Danger: totals.cpc > 5,
    },
    {
      label: "Conversions",
      value: formatNumber(totals.results),
      pill1Label: "CVR",
      pill1Value: formatPercent(totals.cvr),
      pill2Label: "CPA",
      pill2Value: formatCurrency2dp(totals.cost_per_result),
      pill2Danger: totals.cost_per_result > 150,
    },
    {
      label: "Views",
      value: formatNumber(totals.video_3s_views),
      pill1Label: "View rate",
      pill1Value: formatPercent(totals.view_rate),
      pill2Label: "CPV",
      pill2Value: formatCurrency2dp(totals.cpv),
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl bg-muted/30 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">{card.label}</div>
            <div className="flex flex-col items-end gap-1">
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold leading-none",
                  card.pill1Danger ? "bg-destructive/15 text-destructive" : null
                )}
              >
                {card.pill1Label} {card.pill1Value}
              </Badge>
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold leading-none",
                  card.pill2Danger ? "bg-destructive/15 text-destructive" : null
                )}
              >
                {card.pill2Label} {card.pill2Value}
              </Badge>
            </div>
          </div>
          <div className="mt-1 text-sm font-semibold leading-tight text-foreground">{card.value}</div>
        </div>
      ))}
    </div>
  )
}

type DerivedDeliveryRow = {
  dateDay: string
  campaignName: string
  adsetName: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

function deriveDeliveryRow(row: MetaPacingRow): DerivedDeliveryRow {
  const spend = row.amountSpent ?? 0
  const impressions = row.impressions ?? 0
  const clicks = row.clicks ?? 0
  const results = row.results ?? 0
  const video3sViews = row.video3sViews ?? 0

  return {
    dateDay: row.dateDay ? formatDateAU(row.dateDay) : row.dateDay ?? "",
    campaignName: row.campaignName || (row as any).campaign_name || "—",
    adsetName: row.adsetName ?? "",
    spend,
    impressions,
    clicks,
    results,
    video3sViews,
  }
}

function formatPercent(value: number) {
  const num = Number(value)
  if (Number.isNaN(num)) return "0.00%"
  return `${num.toFixed(2)}%`
}

export default function SocialDeliveryContainer({
  clientSlug,
  mbaNumber,
  socialLineItems,
  campaignStart,
  campaignEnd,
  initialPacingRows,
  deliveryLineItemIds,
  brandColour,
  clientFacingLabels = true,
  kpiTargets,
}: SocialDeliveryContainerProps): React.ReactElement {
  const { toast } = useToast()
  const c = (client: string, agency: string) => (clientFacingLabels ? client : agency)
  const StatusBadge = clientFacingLabels ? DeliveryStatusBadge : PacingStatusBadge
  const { exportCsv, isExporting } = useChartExport()
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [viewAsTable, setViewAsTable] = useState(false)
  const [aggregateChartMode, setAggregateChartMode] = useState<"cumulative" | "daily">(
    clientFacingLabels ? "cumulative" : "daily",
  )
  const [lineItemChartModes, setLineItemChartModes] = useState<Record<string, "cumulative" | "daily">>({})

  const getLineItemChartMode = (lineItemId: string): "cumulative" | "daily" => {
    if (lineItemChartModes[lineItemId]) return lineItemChartModes[lineItemId]
    return clientFacingLabels ? "cumulative" : "daily"
  }

  const setLineItemChartMode = (lineItemId: string, mode: "cumulative" | "daily") => {
    setLineItemChartModes((prev) => ({ ...prev, [lineItemId]: mode }))
  }
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const { user, isLoading: authLoading } = useUser()
  const [pacingRows, setPacingRows] = useState<CombinedPacingRow[]>(initialPacingRows ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingFetchKeyRef = useRef<string | null>(null)
  const lastSuccessfulFetchKeyRef = useRef<string | null>(null)
  const retryCountRef = useRef<number>(0)
  const cancelledRef = useRef<boolean>(false)

  // Extract line item ID with multiple field fallbacks
  const extractLineItemId = (item: SocialLineItem): string | null => {
    const id = item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID
    return cleanId(id)
  }

  const socialLineItemIds = useMemo(() => {
    const idsFromItems = (socialLineItems ?? [])
      .map(extractLineItemId)
      .filter(Boolean) as string[]
    const uniqueItems = Array.from(new Set(idsFromItems))
    if (!deliveryLineItemIds?.length) {
      return uniqueItems
    }
    const pacingSet = new Set(
      deliveryLineItemIds.map((id) => cleanId(id)).filter(Boolean) as string[]
    )
    return uniqueItems.filter((id) => pacingSet.has(id))
  }, [deliveryLineItemIds, socialLineItems])

  // Stable string key for dependency tracking
  const idsKey = useMemo(() => socialLineItemIds.join(","), [socialLineItemIds])

  const pacingWindow = useMemo(
    () => getPacingWindow(campaignStart, campaignEnd),
    [campaignStart, campaignEnd]
  )

  useEffect(() => {
    if (initialPacingRows?.length) {
      setPacingRows(initialPacingRows)
      setIsLoading(false)
      setError(null)
    }
  }, [initialPacingRows])

  // Fetch with retry logic
  const fetchPacingData = useCallback(async (
    mbaNum: string,
    lineItemIds: string[],
    startDate: string,
    endDate: string,
    retryAttempt = 0
  ): Promise<void> => {
    cancelledRef.current = false
    setIsLoading(true)
    setError(null)

    const fetchKey = `${mbaNum}|${lineItemIds.join(",")}|${startDate}|${endDate}`
    const attemptCount = retryAttempt + 1

    if (IS_DEV) {
      console.log("[PACING UI] calling /api/pacing/bulk", {
        fetchKey,
        attemptCount,
        mbaNumber: mbaNum,
        count: lineItemIds.length,
        startDate,
        endDate,
      })
    }

    let response: Response | null = null
    try {
      response = await fetch("/api/pacing/bulk", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mbaNumber: mbaNum,
          lineItemIds,
          startDate,
          endDate,
        }),
      })

      // Check for auth-related status codes
      if (response.status === 401 || response.status === 403 || response.status === 302) {
        if (retryAttempt === 0) {
          if (IS_DEV) {
            console.log("[PACING UI] Auth failure, retrying after delay", {
              fetchKey,
              attemptCount,
              status: response.status,
              contentType: response.headers.get("content-type"),
            })
          }
          // Retry once after 400ms
          setTimeout(() => {
            if (!cancelledRef.current) {
              fetchPacingData(mbaNum, lineItemIds, startDate, endDate, 1)
            }
          }, 400)
          return
        } else {
          // Already retried, surface error
          pendingFetchKeyRef.current = null
          const errorText = await response.text().catch(() => "Authentication failed")
          throw new Error(`Authentication failed (${response.status}): ${errorText.slice(0, 200)}`)
        }
      }

      if (!response.ok) {
        pendingFetchKeyRef.current = null
        throw new Error(`Pacing request failed (${response.status})`)
      }

      const data = await parseSocialPacingResponseJson(response)

      if (cancelledRef.current) return

      const rows = Array.isArray(data?.rows) ? data.rows : []
      
      // Check for error in response
      const hasError = Boolean(data?.error)
      const hasRows = rows.length > 0
      
      // If there's an error, always set error state (even if rows exist)
      if (hasError) {
        const errorMsg = String(data.error)
        setError(errorMsg)
        pendingFetchKeyRef.current = null
        
        if (IS_DEV || DEBUG_PACING) {
          console.log("[PACING UI] API returned error", {
            fetchKey,
            attemptCount,
            error: errorMsg,
            rowsCount: rows.length,
          })
        }
        
        // Still set rows if they exist, but mark as error
        if (hasRows) {
          setPacingRows(rows)
        }
        
        // Don't commit key on error
        return
      }

      // Successful: no error field
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Fetch successful", {
          fetchKey,
          attemptCount,
          rowsCount: rows.length,
        })
      }
      
      // Commit the fetch key as successful immediately before setting state
      lastSuccessfulFetchKeyRef.current = fetchKey
      pendingFetchKeyRef.current = null
      setPacingRows(rows)
      setError(null)
      retryCountRef.current = 0
    } catch (err) {
      if (cancelledRef.current) return

      const errorMessage = err instanceof Error ? err.message : String(err)
      
      // Clear pending key on any failure
      pendingFetchKeyRef.current = null
      
      // Check if it's a non-JSON HTML response (likely auth redirect)
      if (errorMessage.includes("Expected JSON but got") && retryAttempt === 0) {
        if (IS_DEV) {
          console.log("[PACING UI] Non-JSON response, retrying after delay", {
            fetchKey,
            attemptCount,
            error: errorMessage,
          })
        }
        setTimeout(() => {
          if (!cancelledRef.current) {
            fetchPacingData(mbaNum, lineItemIds, startDate, endDate, 1)
          }
        }, 400)
        return
      }

      // Don't set empty data on auth failures - just set error
      const isAuthError = response?.status === 401 || response?.status === 403 || response?.status === 302
      if (IS_DEV) {
        console.log("[PACING UI] Fetch error", {
          fetchKey,
          attemptCount,
          error: errorMessage,
          isAuthError,
          keyCommitted: false,
        })
      }
      setError(errorMessage)
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Guard: Skip auto-fetch if initialPacingRows is provided (from DeliveryDataProvider)
    if (initialPacingRows !== undefined) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - initialPacingRows provided", {
          rowsCount: initialPacingRows?.length ?? 0,
        })
      }
      return
    }

    // Guard: Wait for auth to be ready
    if (authLoading) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - auth loading")
      }
      return
    }

    // Guard: Ensure user exists
    if (!user) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - no user")
      }
      return
    }

    // Guard: Ensure slug and mbaNumber are defined
    if (!clientSlug || !mbaNumber) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - missing params", {
          hasSlug: !!clientSlug,
          hasMbaNumber: !!mbaNumber,
        })
      }
      return
    }

    // Guard: Ensure we have line item IDs
    if (!socialLineItemIds.length) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - no line item IDs", {
          idsKey,
          idsCount: socialLineItemIds.length,
        })
      }
      return
    }

    // Guard: Ensure we have a valid date range
    if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - invalid date range", {
          start: pacingWindow.campaignStartISO,
          end: pacingWindow.campaignEndISO,
        })
      }
      return
    }

    const fetchKey = `${mbaNumber}|${idsKey}|${pacingWindow.campaignStartISO}|${pacingWindow.campaignEndISO}`
    
    // Skip if this key is already pending
    if (pendingFetchKeyRef.current === fetchKey) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - key already pending", { fetchKey })
      }
      return
    }
    
    // Skip if this key was successfully fetched (but allow retry if ids change)
    if (lastSuccessfulFetchKeyRef.current === fetchKey) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - key already successful", { fetchKey })
      }
      return
    }
    
    // DEV logging: derived IDs and range
    if (IS_DEV || DEBUG_PACING) {
      console.log("[PACING UI] Preparing fetch", {
        idsKey,
        idsCount: socialLineItemIds.length,
        sampleIds: socialLineItemIds.slice(0, 10),
        pacingRange: {
          start: pacingWindow.campaignStartISO,
          end: pacingWindow.campaignEndISO,
        },
        fetchKey,
      })
    }
    
    // Set pending key and commit successful key immediately before calling fetch
    pendingFetchKeyRef.current = fetchKey
    // Note: lastSuccessfulFetchKeyRef will be set inside fetchPacingData on success

    fetchPacingData(
      mbaNumber,
      socialLineItemIds,
      pacingWindow.campaignStartISO,
      pacingWindow.campaignEndISO
    )

    return () => {
      cancelledRef.current = true
    }
  }, [
    authLoading,
    user,
    clientSlug,
    mbaNumber,
    pacingWindow.campaignEndISO,
    pacingWindow.campaignStartISO,
    idsKey,
    socialLineItemIds,
    initialPacingRows,
    fetchPacingData,
  ])

  // Filter pacingRows by channel using useMemo
  const metaRows = useMemo(() => {
    if (!Array.isArray(pacingRows)) return []
    return pacingRows
      .filter((row) => row.channel === "meta")
      .map(mapCombinedRowToMeta)
  }, [pacingRows])

  const tiktokRows = useMemo(() => {
    if (!Array.isArray(pacingRows)) return []
    return pacingRows
      .filter((row) => row.channel === "tiktok")
      .map(mapCombinedRowToMeta)
  }, [pacingRows])

  // Combine rows for filtering in lineItemMetrics
  const socialRows = useMemo(() => [...metaRows, ...tiktokRows], [metaRows, tiktokRows])

  // Use props directly - no state management needed
  const resolvedCampaignStart = campaignStart
  const resolvedCampaignEnd = campaignEnd

  const normalizedLineItems = useMemo(
    () => normalizeLineItems(socialLineItems ?? []),
    [socialLineItems]
  )

  const metaItems = useMemo(
    () =>
      normalizedLineItems.filter((item) => {
        const platform = classifyPlatform(item.platform, getLineItemNameCandidate(item))
        return platform === "meta"
      }),
    [normalizedLineItems]
  )

  const tiktokItems = useMemo(
    () =>
      normalizedLineItems.filter((item) => {
        const platform = classifyPlatform(item.platform, getLineItemNameCandidate(item))
        return platform === "tiktok"
      }),
    [normalizedLineItems]
  )

  const lineItemMetrics: LineItemMetrics[] = useMemo(() => {
    const activeItems = [...metaItems, ...tiktokItems]
    if (!activeItems.length) return []
    const today = startOfDay(new Date())
    const asAtForSummary = parseDateSafe(pacingWindow.asAtISO) ?? today
    const campaignStartD = parseDateSafe(campaignStart)
    const campaignEndD = parseDateSafe(campaignEnd)
    const campaignDayRange =
      campaignStartD && campaignEndD ? eachDay(campaignStartD, campaignEndD) : []

    return activeItems.map((item) => {
      const bursts = item.bursts ?? parseBursts(item.bursts_json)
      const window = getLineItemWindow(bursts, resolvedCampaignStart, resolvedCampaignEnd)
      const targetId = extractLineItemId(item)
      const matches = socialRows.reduce(
        (acc, r) => {
          const rid = getRowLineItemId(r)
          if (!rid || !targetId) return acc
          if (rid === targetId) {
            acc.rows.push(r as MetaPacingRow)
            acc.byId += 1
          }
          return acc
        },
        { rows: [] as MetaPacingRow[], byId: 0 }
      )
      const matchedRows = matches.rows

      if (DEBUG_PACING && targetId && matchedRows.length === 0) {
        const platform = classifyPlatform(item.platform, getLineItemNameCandidate(item))
        const platformRows = platform === "meta" ? metaRows : platform === "tiktok" ? tiktokRows : socialRows
        const sampleEntityNames = platformRows
          .map((r) => (r as any)?.entityName ?? (r as any)?.adsetName ?? (r as any)?.ADSET_NAME ?? null)
          .filter(Boolean)
          .slice(0, 5)
        console.info("[SocialPacing] unmatched line item", {
          mba: mbaNumber,
          lineItemId: targetId,
          platform,
          dateWindow: { start: window.startISO, end: window.endISO },
          sampleEntityNames,
        })
      }
      const deliverySummary = summariseDelivery(
        matchedRows,
        campaignStart,
        campaignEnd,
        asAtForSummary
      )

      const totalBudget = item.total_budget ?? 0
      const totalDeliverables = item.goal_deliverable_total ?? 0
      const hasSchedule = (bursts ?? []).length > 0
      const fallbackBurst: Burst[] =
        !hasSchedule && window.startISO && window.endISO
          ? [
              {
                start_date: window.startISO,
                end_date: window.endISO,
                media_investment: totalBudget,
                deliverables: totalDeliverables,
                budget_number: totalBudget,
                calculated_value_number: totalDeliverables,
              },
            ]
          : []
      const burstsToUse = hasSchedule ? bursts : fallbackBurst
      const deliverableKey = resolveDeliverableKey(item.buy_type, item.platform)

      const dailyLookup = new Map<string, (typeof deliverySummary.daily)[number]>()
      deliverySummary.daily.forEach((day) => dailyLookup.set(day.dateDay, day))

      const dateRange =
        campaignDayRange.length > 0 ? campaignDayRange : Array.from(dailyLookup.keys()).sort()

      const actualsDaily: (ActualsDaily & { deliverable_value?: number })[] = dateRange.map(
        (date) => {
          const day = dailyLookup.get(date)
          const deliverableValue =
            deliverableKey && deliverableKey !== "deliverable_value"
              ? (day as any)?.[deliverableKey] ?? 0
              : (day as any)?.results ?? 0

          return {
            date,
            spend: day?.amountSpent ?? 0,
            impressions: day?.impressions ?? 0,
            clicks: day?.clicks ?? 0,
            results: day?.results ?? 0,
            video_3s_views: (day as any)?.video3sViews ?? 0,
            deliverable_value: deliverableValue,
          }
        }
      )

      const asAtDate = pacingWindow.asAtISO

      const deliveredTotals = sumDeliveredUpToDate(
        actualsDaily,
        deliverableKey ?? "deliverable_value",
        asAtDate
      )
      const booked = sumBookedFromBursts(burstsToUse ?? [])

      const shouldSpend = computeShouldToDateFromBursts(burstsToUse ?? [], asAtDate, "spend")
      const shouldDeliverables = computeShouldToDateFromBursts(
        burstsToUse ?? [],
        asAtDate,
        "deliverables"
      )

      const pacing: PacingResult = {
        asAtDate,
        spend: {
          actualToDate: round2(deliveredTotals.spend),
          expectedToDate: round2(shouldSpend),
          delta: round2(deliveredTotals.spend - shouldSpend),
          pacingPct: round2(shouldSpend > 0 ? (deliveredTotals.spend / shouldSpend) * 100 : 0),
          goalTotal: round2(booked.spend),
        },
        series: buildCumulativeSeries(
          dateRange,
          actualsDaily,
          deliverableKey ?? "deliverable_value"
        ),
      }

      if (deliverableKey) {
        pacing.deliverable = {
          actualToDate: round2(deliveredTotals.deliverables),
          expectedToDate: round2(shouldDeliverables),
          delta: round2(deliveredTotals.deliverables - shouldDeliverables),
          pacingPct: round2(
            shouldDeliverables > 0 ? (deliveredTotals.deliverables / shouldDeliverables) * 100 : 0
          ),
          goalTotal: round2(booked.deliverables),
        }
      }

      const targetMetric = targetMetricForDeliverableKey(deliverableKey)
      let targetCurve: TargetCurvePoint[] = []
      let cumulativeActual: Array<{ date: string; actual: number }> = []
      let onTrackStatus: OnTrackStatus = "no-data"

      if (
        targetMetric &&
        kpiTargets &&
        kpiTargets.size > 0 &&
        pacingWindow.campaignStartISO &&
        pacingWindow.campaignEndISO
      ) {
        const tcli = buildSocialTargetCurveLineItem(item, burstsToUse ?? [])
        if (tcli) {
          targetCurve = buildCumulativeTargetCurve({
            campaignStartISO: pacingWindow.campaignStartISO,
            campaignEndISO: pacingWindow.campaignEndISO,
            lineItems: [tcli],
            kpiTargets,
            metric: targetMetric,
            tolerance: 0.15,
          })

          if (targetCurve.length) {
            const dailyActualsByDate = new Map<string, number>()
            for (const row of pacing.series) {
              dailyActualsByDate.set(
                String(row.date),
                Math.max(0, Number(row.actualDeliverable ?? 0) || 0),
              )
            }
            cumulativeActual = buildCumulativeActualSeries(
              targetCurve.map((p) => p.date),
              dailyActualsByDate,
            )
            const cumActualByDate = new Map(cumulativeActual.map((r) => [r.date, r.actual]))
            const asAtEval = pacing.asAtDate ?? getMelbourneTodayISO()
            onTrackStatus = evaluateOnTrack(targetCurve, cumActualByDate, asAtEval)
          }
        }
      }

      return {
        lineItem: item,
        pacing,
        bursts: burstsToUse ?? [],
        window,
        actualsDaily,
        matchedRows,
        matchBreakdown: {
          targetId,
          byId: matches.byId,
          platform: normalisePlatform(item.platform),
        },
        booked,
        delivered: {
          spend: round2(deliveredTotals.spend),
          deliverables: round2(deliveredTotals.deliverables),
        },
        shouldToDate: {
          spend: round2(shouldSpend),
          deliverables: round2(shouldDeliverables),
        },
        deliverableKey,
        targetMetric,
        targetCurve,
        cumulativeActual,
        onTrackStatus,
      }
    })
  }, [
    metaItems,
    tiktokItems,
    socialRows,
    resolvedCampaignStart,
    resolvedCampaignEnd,
    metaRows,
    tiktokRows,
    mbaNumber,
    campaignStart,
    campaignEnd,
    pacingWindow.asAtISO,
    pacingWindow.campaignStartISO,
    pacingWindow.campaignEndISO,
    kpiTargets,
  ])

  const aggregatePacing = useMemo(
    () =>
      buildAggregatedMetrics(
        lineItemMetrics,
        pacingWindow.asAtISO,
        campaignStart,
        campaignEnd
      ),
    [lineItemMetrics, pacingWindow.asAtISO, campaignStart, campaignEnd]
  )

  const aggregateTargetCurve: TargetCurvePoint[] = useMemo(() => {
    if (!kpiTargets || kpiTargets.size === 0) return []
    if (!lineItemMetrics.length) return []
    if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

    const tclis: TargetCurveLineItem[] = []
    for (const metric of lineItemMetrics) {
      if (!metric.targetMetric) continue
      const tcli = buildSocialTargetCurveLineItem(metric.lineItem, metric.bursts)
      if (tcli) tclis.push(tcli)
    }
    if (!tclis.length) return []

    const metrics = new Set(lineItemMetrics.map((m) => m.targetMetric).filter(Boolean))
    if (metrics.size !== 1) return []
    const sharedMetric = Array.from(metrics)[0] as "clicks" | "views"

    return buildCumulativeTargetCurve({
      campaignStartISO: pacingWindow.campaignStartISO,
      campaignEndISO: pacingWindow.campaignEndISO,
      lineItems: tclis,
      kpiTargets,
      metric: sharedMetric,
      tolerance: 0.15,
    })
  }, [kpiTargets, lineItemMetrics, pacingWindow.campaignStartISO, pacingWindow.campaignEndISO])

  const aggregateCumulativeActual = useMemo(() => {
    if (!aggregateTargetCurve.length) return []
    const dailyByDate = new Map<string, number>()
    for (const row of aggregatePacing.series) {
      const prev = dailyByDate.get(String(row.date)) ?? 0
      dailyByDate.set(
        String(row.date),
        prev + Math.max(0, Number(row.actualDeliverable ?? 0) || 0),
      )
    }
    return buildCumulativeActualSeries(
      aggregateTargetCurve.map((p) => p.date),
      dailyByDate,
    )
  }, [aggregateTargetCurve, aggregatePacing.series])

  const aggregateOnTrackStatus: OnTrackStatus = useMemo(() => {
    if (!aggregateTargetCurve.length) return "no-data"
    const cumActualByDate = new Map(aggregateCumulativeActual.map((r) => [r.date, r.actual]))
    const asAt = aggregatePacing.asAtDate ?? getMelbourneTodayISO()
    return evaluateOnTrack(aggregateTargetCurve, cumActualByDate, asAt)
  }, [aggregateTargetCurve, aggregateCumulativeActual, aggregatePacing.asAtDate])

  const bookedTotals = useMemo(() => {
    return {
      spend: round2(lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0)),
      deliverables: round2(
        lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0)
      ),
    }
  }, [lineItemMetrics])

  const aggregateSocialAccentColors = useMemo(() => {
    const m = assignEntityColors(["Actual spend", "Deliverables actual"], "generic")
    return {
      spend: brandColour ?? m.get("Actual spend")!,
      deliverable: m.get("Deliverables actual")!,
    }
  }, [brandColour])

  const debugSummary = useMemo(() => {
    const perItem = lineItemMetrics.map((metric) => ({
      id: String(metric.lineItem.line_item_id ?? ""),
      name: metric.lineItem.line_item_name,
      platform: metric.matchBreakdown.platform,
      targetId: metric.matchBreakdown.targetId,
      matched: metric.matchedRows.length,
      matchedById: metric.matchBreakdown.byId,
    }))
    const zeroMatches = perItem.filter((item) => item.matched === 0)
    return {
      metaCount: metaItems.length,
      tiktokCount: tiktokItems.length,
      metaRowCount: metaRows.length,
      tiktokRowCount: tiktokRows.length,
      perItem,
      zeroMatches,
    }
  }, [lineItemMetrics, metaItems.length, tiktokItems.length, metaRows.length, tiktokRows.length])

  useEffect(() => {
    if (!isLoading && !error) {
      setLastSyncedAt(new Date())
    }
  }, [isLoading, error])

  const aggregateChartRef = useRef<HTMLDivElement | null>(null)
  const lineChartRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const setLineChartRef = (id: string) => (node: HTMLDivElement | null) => {
    lineChartRefs.current[id] = node
  }

  const sanitizeFilename = (value: string) =>
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "social"

  async function handleExportCSVs() {
    const base = `social-${sanitizeFilename(clientSlug)}-${sanitizeFilename(mbaNumber)}`
    const aggregateSeries = aggregatePacing.series.map((point) => ({
      date: point.date,
      actual_spend: point.actualSpend,
      expected_spend: point.expectedSpend,
      actual_deliverable: point.actualDeliverable,
      expected_deliverable: point.expectedDeliverable,
    }))

    const perLineSeries = lineItemMetrics.flatMap((metric) =>
      metric.pacing.series.map((point) => ({
        line_item_id: metric.lineItem.line_item_id,
        line_item_name: metric.lineItem.line_item_name,
        date: point.date,
        actual_spend: point.actualSpend,
        expected_spend: point.expectedSpend,
        actual_deliverable: point.actualDeliverable,
        expected_deliverable: point.expectedDeliverable,
      }))
    )

    const deliveryRows = socialRows.map((row) => ({
      ...row,
    }))

    const combinedRows = perLineSeries.map((row) => ({
      ...row,
      source: "line-item",
    }))
    exportCsv(
      combinedRows,
      Object.keys(combinedRows[0] ?? {}).map((k) => ({
        header: k,
        accessor: (row: Record<string, unknown>) => row[k],
      })),
      `${base}-combined-line-items.csv`,
    )
    exportCsv(
      aggregateSeries,
      Object.keys(aggregateSeries[0] ?? {}).map((k) => ({ header: k, accessor: (row: Record<string, unknown>) => row[k] })),
      `${base}-aggregate-series.csv`,
    )
    exportCsv(
      deliveryRows,
      Object.keys(deliveryRows[0] ?? {}).map((k) => ({ header: k, accessor: (row: Record<string, unknown>) => row[k] })),
      `${base}-delivery-rows.csv`,
    )
    toast({ title: "CSV exported", description: "Combined and aggregate social CSV files downloaded." })
  }

  async function exportElementPng(el: HTMLElement, filename: string) {
    const html2canvas = (await import("html2canvas")).default
    const canvas = await html2canvas(el, {
      // Use a light background so exports aren't dark in PNG
      backgroundColor: CHART_NEUTRAL.surface,
      scale: 2,
    })
    const dataUrl = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = `${filename}.png`
    link.click()
  }

  async function handleExportCharts() {
    const base = `social-${sanitizeFilename(clientSlug)}-${sanitizeFilename(mbaNumber)}`
    const targets: Array<{ el: HTMLElement | null; name: string }> = [
      { el: aggregateChartRef.current, name: `${base}-aggregate-chart` },
      ...lineItemMetrics.map((metric) => ({
        el: lineChartRefs.current[String(metric.lineItem.line_item_id)],
        name: `${base}-${sanitizeFilename(metric.lineItem.line_item_id ?? "line-item")}-chart`,
      })),
    ]

    const JSZip = (await import("jszip")).default
    const { saveAs } = await import("file-saver")
    const html2canvas = (await import("html2canvas")).default
    const zip = new JSZip()
    for (const target of targets) {
      if (!target.el) continue
      const canvas = await html2canvas(target.el, { backgroundColor: CHART_NEUTRAL.surface, scale: 2 })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (blob) {
        zip.file(`${target.name}.png`, blob)
      }
      await new Promise((res) => setTimeout(res, 120))
    }
    const output = await zip.generateAsync({ type: "blob" })
    saveAs(output, `${base}-charts.zip`)
    toast({ title: "PNG ZIP exported", description: "Social chart exports are ready." })
  }

  const handleSyncNow = () => {
    window.location.reload()
  }

  const aggregateSummary = useMemo(() => {
    const totalSpend = lineItemMetrics.reduce((sum, metric) => sum + Number(metric.pacing.spend.actualToDate ?? 0), 0)
    const totalDeliverables = lineItemMetrics.reduce(
      (sum, metric) => sum + Number(metric.pacing.deliverable?.actualToDate ?? 0),
      0
    )
    const avgPacing =
      lineItemMetrics.length > 0
        ? lineItemMetrics.reduce((sum, metric) => sum + Number(metric.pacing.spend.pacingPct ?? 0), 0) / lineItemMetrics.length
        : 0
    return { totalSpend, totalDeliverables, avgPacing }
  }, [lineItemMetrics])

  const aggregateDeliveryKpis = useMemo(
    () => summarizeActuals(lineItemMetrics.flatMap((metric) => metric.actualsDaily)),
    [lineItemMetrics]
  )

  const hasAnyData =
    lineItemMetrics.length > 0 || (aggregatePacing.series?.length ?? 0) > 0

  const handleCopyAggregateSeries = async () => {
    await navigator.clipboard.writeText(JSON.stringify(aggregatePacing.series))
    toast({ title: "Copied", description: "Aggregate chart data copied." })
  }

  const pacingCardActions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={handleSyncNow}
        disabled={isLoading}
        title="Sync now"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={handleExportCSVs}
        disabled={isExporting}
        title="Export CSV"
      >
        <FileSpreadsheet className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={handleExportCharts}
        disabled={isExporting}
        title="Export charts (PNG ZIP)"
      >
        <ImageDown className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={handleCopyAggregateSeries}
        disabled={isExporting || !hasAnyData}
        title="Copy chart data"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </>
  )

  return (
    <DeliveryCard
      icon={Music2}
      title={c("Social delivery", "Social Pacing")}
      subtitle={`${formatDateAU(campaignStart)} – ${formatDateAU(campaignEnd)}`}
      actions={pacingCardActions}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
            {clientSlug} • {mbaNumber}
          </Badge>
          <Badge variant="secondary" className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px]">
            <MessageCircleMore className="h-3.5 w-3.5" />
            {metaItems.length > 0 ? "Meta connected" : "Meta unavailable"}
          </Badge>
          <Badge variant="secondary" className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px]">
            <Music2 className="h-3.5 w-3.5" />
            {tiktokItems.length > 0 ? "TikTok connected" : "TikTok unavailable"}
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
            Last synced{" "}
            {lastSyncedAt
              ? new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(lastSyncedAt)
              : "—"}
          </Badge>
        </div>

        {!isLoading ? (
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Total spend</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency(aggregateSummary.totalSpend)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Total impressions</p>
              <p className="text-sm font-semibold text-foreground">{formatNumber(aggregateDeliveryKpis.impressions)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Avg CPM</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency2dp(aggregateDeliveryKpis.cpm)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{c("Avg delivery", "Avg pacing")}</p>
              <p className="text-sm font-semibold text-foreground">{aggregateSummary.avgPacing.toFixed(1)}%</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <div className="flex items-center justify-between gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={handleSyncNow}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SmallProgressCard
              label={c("Spend delivery", "Spend pacing")}
              value={formatCurrency(aggregatePacing.spend.actualToDate)}
              helper={`Delivered ${formatCurrency(aggregatePacing.spend.actualToDate)} • Planned ${formatCurrency(bookedTotals.spend)}`}
              pacingPct={aggregatePacing.spend.pacingPct}
              progressRatio={
                bookedTotals.spend > 0
                  ? Math.max(0, Math.min(1, aggregatePacing.spend.actualToDate / bookedTotals.spend))
                  : 0
              }
              accentColor={aggregateSocialAccentColors.spend}
              sparklineData={aggregatePacing.series.map((s) => Number(s.actualSpend ?? 0))}
              comparisonValue={100}
              comparisonLabel={c("Expected delivery", "Expected pace")}
              clientFacingLabels={clientFacingLabels}
              embedded
            />
            <SmallProgressCard
              label={c("Deliverable delivery", "Deliverable pacing")}
              value={formatWholeNumber(aggregatePacing.deliverable?.actualToDate)}
              helper={`Delivered ${formatWholeNumber(aggregatePacing.deliverable?.actualToDate)} • Planned ${formatWholeNumber(bookedTotals.deliverables)}`}
              pacingPct={aggregatePacing.deliverable?.pacingPct}
              progressRatio={
                bookedTotals.deliverables > 0
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        (aggregatePacing.deliverable?.actualToDate ?? 0) / bookedTotals.deliverables
                      )
                    )
                  : 0
              }
              accentColor={aggregateSocialAccentColors.deliverable}
              sparklineData={aggregatePacing.series.map((s) => Number(s.actualDeliverable ?? 0))}
              comparisonValue={100}
              comparisonLabel={c("Expected delivery", "Expected pace")}
              clientFacingLabels={clientFacingLabels}
              embedded
            />
          </div>
        )}

        {!isLoading ? (
          <>
            <DeliverySubCard
              icon={LayoutDashboard}
              title="Delivery KPIs"
              subtitle="Impressions, clicks, conversions & views"
            >
              <KpiCallouts totals={aggregateDeliveryKpis} />
            </DeliverySubCard>
            <DeliverySubCard
              icon={LineChartIcon}
              title={
                aggregateChartMode === "cumulative" &&
                clientFacingLabels &&
                aggregateTargetCurve.length > 0
                  ? "Aggregate: Cumulative vs target"
                  : "Aggregate delivery chart"
              }
              subtitle="Deliverable type: Deliverables"
            >
              {clientFacingLabels && aggregateTargetCurve.length > 0 ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-0.5 text-[11px]">
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1 transition",
                        aggregateChartMode === "cumulative"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setAggregateChartMode("cumulative")}
                    >
                      Cumulative vs target
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1 transition",
                        aggregateChartMode === "daily"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setAggregateChartMode("daily")}
                    >
                      Daily
                    </button>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                      aggregateOnTrackStatus === "on-track" &&
                        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      aggregateOnTrackStatus === "ahead" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                      aggregateOnTrackStatus === "behind" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      aggregateOnTrackStatus === "no-data" && "bg-muted text-muted-foreground",
                    )}
                    aria-live="polite"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        aggregateOnTrackStatus === "on-track" && "bg-emerald-500",
                        aggregateOnTrackStatus === "ahead" && "bg-blue-500",
                        aggregateOnTrackStatus === "behind" && "bg-amber-500",
                        aggregateOnTrackStatus === "no-data" && "bg-muted-foreground",
                      )}
                      aria-hidden
                    />
                    {aggregateOnTrackStatus === "on-track" && "On track"}
                    {aggregateOnTrackStatus === "ahead" && "Ahead of pace"}
                    {aggregateOnTrackStatus === "behind" && "Behind pace"}
                    {aggregateOnTrackStatus === "no-data" && "Awaiting data"}
                  </span>
                </div>
              ) : null}

              {aggregateChartMode === "cumulative" &&
              clientFacingLabels &&
              aggregateTargetCurve.length > 0 ? (
                <ActualsCumulativeVsTargetChart
                  targetCurve={aggregateTargetCurve}
                  cumulativeActual={aggregateCumulativeActual}
                  asAtDate={aggregatePacing.asAtDate}
                  deliverableLabel="Deliverables"
                  chartRef={aggregateChartRef}
                  brandColour={brandColour}
                />
              ) : (
                <ActualsDailyDeliveryChart
                  series={aggregatePacing.series}
                  asAtDate={aggregatePacing.asAtDate}
                  deliverableLabel="Deliverables"
                  chartRef={aggregateChartRef}
                  platform="mixed"
                  brandColour={brandColour}
                />
              )}
            </DeliverySubCard>
          </>
        ) : (
          <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
        )}

        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={() => setViewAsTable((prev) => !prev)}>
            {viewAsTable ? "View as accordion" : "View as table"}
          </Button>
        </div>

        {DEBUG_PACING ? (
          <DeliverySubCard icon={LayoutDashboard} title={c("Delivery debug", "Pacing debug")} subtitle="Development only">
            <div className="text-sm text-muted-foreground">
              <div>Meta line items: {debugSummary.metaCount}</div>
              <div>TikTok line items: {debugSummary.tiktokCount}</div>
              <div className="mt-1">
                <span className="font-medium text-foreground">Rows</span>: meta {debugSummary.metaRowCount} • tiktok{" "}
                {debugSummary.tiktokRowCount}
              </div>
              <div className="mt-2">
                {debugSummary.perItem.length ? (
                  <ul className="space-y-1">
                    {debugSummary.perItem.map((item) => (
                      <li key={item.id}>
                        <span className="font-medium text-foreground">{item.name || item.id}</span> ({item.platform || "?"}) target{" "}
                        {item.targetId || "—"} → matched {item.matched} (id {item.matchedById})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>No social line items.</div>
                )}
              </div>
              {debugSummary.zeroMatches.length ? (
                <div className="mt-2">
                  <div className="font-medium text-foreground">Zero matches</div>
                  <ul className="space-y-1">
                    {debugSummary.zeroMatches.map((item) => (
                      <li key={item.id}>{item.name || item.id}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </DeliverySubCard>
        ) : null}

        {viewAsTable ? (
          <DeliverySubCard
            icon={Table}
            title="Line items"
            subtitle={c("Spend & delivery overview", "Spend & pacing overview")}
          >
            <div className="overflow-hidden">
              <div className="grid grid-cols-5 gap-2 border-b border-border/60 bg-background/95 px-3 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
                <div>Line item</div>
                <div className="text-right">Spend</div>
                <div className="text-right">Deliverables</div>
                <div className="text-right">{c("Delivery %", "Pacing %")}</div>
                <div className="text-right">Status</div>
              </div>
              {lineItemMetrics.map((metric, rowIdx) => (
                <div
                  key={`row-${metric.lineItem.line_item_id}`}
                  className={cn(
                    "campaign-section-enter grid grid-cols-5 gap-2 border-b px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-muted/30",
                    rowIdx % 2 === 1 ? "bg-muted/20" : "bg-background"
                  )}
                  style={{ animationDelay: `${rowIdx * 50}ms` }}
                >
                  <div>{formatLineItemHeader(metric.lineItem)}</div>
                  <div className="text-right">{formatCurrency(metric.pacing.spend.actualToDate)}</div>
                  <div className="text-right">{formatWholeNumber(metric.pacing.deliverable?.actualToDate)}</div>
                  <div className="text-right">{(metric.pacing.spend.pacingPct ?? 0).toFixed(1)}%</div>
                  <div className="flex justify-end">
                    <StatusBadge pacingPct={metric.pacing.spend.pacingPct ?? 0} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </DeliverySubCard>
        ) : (
          <Accordion type="multiple" defaultValue={[]}>
            {lineItemMetrics.map((metric, accIdx) => {
              const lineId = String(metric.lineItem.line_item_id)
              const spendPacing = metric.pacing.spend.pacingPct ?? 0
              const pacingTone = pacingDeviationBorderClass(spendPacing)
              const sparklineTone = pacingDeviationSparklineClass(spendPacing)
              const delLabel = getDeliverableLabel(metric.deliverableKey)
              return (
                <AccordionItem
                  key={lineId}
                  value={lineId}
                  className="campaign-section-enter mb-3 border-0 bg-transparent p-0 shadow-none transition-all duration-200 data-[state=open]:shadow-sm"
                  style={{ animationDelay: `${accIdx * 60}ms` }}
                >
                  <div
                    className={cn(
                      "overflow-hidden rounded-xl border border-border/60 bg-background/60 transition-colors hover:bg-muted/10 data-[state=open]:shadow-sm",
                      pacingTone,
                    )}
                  >
                    <AccordionTrigger className="px-4 py-3 text-left text-sm font-semibold hover:no-underline">
                      <div className="grid w-full grid-cols-[1fr_auto] items-center gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn("h-[28px] w-[80px]", sparklineTone)}>
                            <Sparkline data={metric.pacing.series.map((p) => Number(p.actualSpend ?? 0))} height={28} />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="truncate font-medium">{formatLineItemHeader(metric.lineItem)}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {metric.lineItem.buy_type || "—"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                            {compareIds.has(lineId) ? "Compare: On" : "Compare: Off"}
                          </Badge>
                          <Badge className="rounded-full bg-muted px-3 py-1 text-[11px] text-foreground">
                            {formatCurrency(metric.pacing.spend.actualToDate)}
                          </Badge>
                          <Badge className="rounded-full bg-muted px-3 py-1 text-[11px] text-foreground">
                            {formatWholeNumber(metric.pacing.deliverable?.actualToDate)}
                          </Badge>
                          <StatusBadge pacingPct={spendPacing} size="sm" />
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                      <div className="flex items-center justify-end">
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={compareIds.has(lineId)}
                            onCheckedChange={(checked) =>
                              setCompareIds((prev) => {
                                const next = new Set(prev)
                                if (checked) next.add(lineId)
                                else next.delete(lineId)
                                return next
                              })
                            }
                          />
                          Compare
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {(() => {
                          const delActualName = `${delLabel} actual`
                          const pacingAccent = assignEntityColors(["Actual spend", delActualName], "generic")
                          return (
                            <>
                              <SmallProgressCard
                                label={c("Spend delivery", "Spend pacing")}
                                value={formatCurrency(metric.pacing.spend.actualToDate)}
                                helper={`Delivered ${formatCurrency(metric.pacing.spend.actualToDate)} • Booked ${formatCurrency(metric.booked.spend)}`}
                                pacingPct={metric.pacing.spend.pacingPct}
                                progressRatio={
                                  metric.booked.spend > 0
                                    ? Math.max(0, Math.min(1, metric.pacing.spend.actualToDate / metric.booked.spend))
                                    : 0
                                }
                                accentColor={brandColour ?? pacingAccent.get("Actual spend")!}
                                sparklineData={metric.pacing.series.map((p) => Number(p.actualSpend ?? 0))}
                                comparisonValue={100}
                                comparisonLabel={c("Expected delivery", "Expected pace")}
                                clientFacingLabels={clientFacingLabels}
                                embedded
                              />
                              <SmallProgressCard
                                label={c(`${delLabel} delivery`, `${delLabel} pacing`)}
                                value={formatWholeNumber(metric.pacing.deliverable?.actualToDate)}
                                helper={`Delivered ${formatWholeNumber(metric.pacing.deliverable?.actualToDate)} ${delLabel} • Booked ${formatWholeNumber(metric.booked.deliverables)} ${delLabel}`}
                                pacingPct={metric.pacing.deliverable?.pacingPct}
                                progressRatio={
                                  metric.booked.deliverables > 0
                                    ? Math.max(
                                        0,
                                        Math.min(
                                          1,
                                          (metric.pacing.deliverable?.actualToDate ?? 0) / metric.booked.deliverables
                                        )
                                      )
                                    : 0
                                }
                                accentColor={pacingAccent.get(delActualName)!}
                                sparklineData={metric.pacing.series.map((p) => Number(p.actualDeliverable ?? 0))}
                                comparisonValue={100}
                                comparisonLabel={c("Expected delivery", "Expected pace")}
                                clientFacingLabels={clientFacingLabels}
                                embedded
                              />
                            </>
                          )
                        })()}
                      </div>
                      <DeliverySubCard
                        icon={LayoutDashboard}
                        title="Delivery KPIs"
                        subtitle={`${delLabel} efficiency`}
                      >
                        <KpiCallouts totals={summarizeActuals(metric.actualsDaily)} />
                      </DeliverySubCard>
                      <DeliverySubCard
                        icon={LineChartIcon}
                        title={
                          getLineItemChartMode(lineId) === "cumulative" &&
                          clientFacingLabels &&
                          metric.targetCurve.length > 0
                            ? `Cumulative ${delLabel} vs target`
                            : `Daily ${delLabel} + spend`
                        }
                        subtitle={metric.pacing.series.length ? `${metric.pacing.series.length} days` : "—"}
                      >
                        {clientFacingLabels && metric.targetCurve.length > 0 ? (
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-0.5 text-[11px]">
                              <button
                                type="button"
                                className={cn(
                                  "rounded-full px-3 py-1 transition",
                                  getLineItemChartMode(lineId) === "cumulative"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => setLineItemChartMode(lineId, "cumulative")}
                              >
                                Cumulative vs target
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "rounded-full px-3 py-1 transition",
                                  getLineItemChartMode(lineId) === "daily"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => setLineItemChartMode(lineId, "daily")}
                              >
                                Daily
                              </button>
                            </div>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                                metric.onTrackStatus === "on-track" &&
                                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                                metric.onTrackStatus === "ahead" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                                metric.onTrackStatus === "behind" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                metric.onTrackStatus === "no-data" && "bg-muted text-muted-foreground",
                              )}
                              aria-live="polite"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  metric.onTrackStatus === "on-track" && "bg-emerald-500",
                                  metric.onTrackStatus === "ahead" && "bg-blue-500",
                                  metric.onTrackStatus === "behind" && "bg-amber-500",
                                  metric.onTrackStatus === "no-data" && "bg-muted-foreground",
                                )}
                                aria-hidden
                              />
                              {metric.onTrackStatus === "on-track" && "On track"}
                              {metric.onTrackStatus === "ahead" && "Ahead of pace"}
                              {metric.onTrackStatus === "behind" && "Behind pace"}
                              {metric.onTrackStatus === "no-data" && "Awaiting data"}
                            </span>
                          </div>
                        ) : null}

                        {getLineItemChartMode(lineId) === "cumulative" &&
                        clientFacingLabels &&
                        metric.targetCurve.length > 0 ? (
                          <ActualsCumulativeVsTargetChart
                            targetCurve={metric.targetCurve}
                            cumulativeActual={metric.cumulativeActual}
                            asAtDate={metric.pacing.asAtDate}
                            deliverableLabel={delLabel}
                            chartRef={setLineChartRef(lineId)}
                            brandColour={brandColour}
                          />
                        ) : (
                          <ActualsDailyDeliveryChart
                            series={metric.pacing.series}
                            asAtDate={metric.pacing.asAtDate}
                            deliverableLabel={delLabel}
                            chartRef={setLineChartRef(lineId)}
                            platform={metric.matchBreakdown.platform === "tiktok" ? "tiktok" : "meta"}
                            brandColour={brandColour}
                          />
                        )}
                      </DeliverySubCard>
                      <DeliverySubCard icon={Table} title="Daily delivery" subtitle="Spend and metrics by day">
                        <DeliveryTable daily={metric.actualsDaily} />
                      </DeliverySubCard>
                    </AccordionContent>
                  </div>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </div>
    </DeliveryCard>
  )
}
