"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@/components/AuthWrapper"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import { Sparkline } from "@/components/charts/Sparkline"
import { SmallProgressCard } from "@/components/dashboard/delivery/SmallProgressCard"
import { DeliveryCard, DeliverySubCard } from "@/components/dashboard/delivery/DeliveryCard"
import { ActualsCumulativeVsTargetChart } from "@/components/dashboard/delivery/common/ActualsCumulativeVsTargetChart"
import { useToast } from "@/components/ui/use-toast"
import { downloadCSV } from "@/lib/utils/csv-export"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { Dv360DailyRow } from "@/lib/pacing/dv360/dv360Pacing"
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric"
import { CHART_NEUTRAL } from "@/lib/charts/theme"
import { assignEntityColors } from "@/lib/charts/registry"
import {
  PACING_CARTESIAN_GRID_PROPS,
  PACING_TODAY_REFERENCE_LINE_PROPS,
  PACING_TOOLTIP_SHELL_CLASS,
} from "@/lib/charts/pacingLineChartStyle"
import { pacingDeviationBorderClass, pacingDeviationSparklineClass } from "@/lib/pacing/pacingDeviationStyle"
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
import { DeliveryStatusBadge } from "@/components/dashboard/delivery/DeliveryStatusBadge"
import { PacingStatusBadge } from "@/components/dashboard/PacingStatusBadge"
import { cn } from "@/lib/utils"
import {
  Copy,
  FileSpreadsheet,
  ImageDown,
  LayoutDashboard,
  LineChart as LineChartIcon,
  MonitorPlay,
  RefreshCw,
  Table,
} from "lucide-react"

type ProgrammaticLineItem = {
  line_item_id: string
  line_item_name?: string
  buy_type?: string
  platform?: string
  bursts?: any[]
  bursts_json?: string | any[]
  total_budget?: number
  goal_deliverable_total?: number
  start_date?: string
  end_date?: string
  [key: string]: any
}

type ProgrammaticDeliveryContainerProps = {
  clientSlug: string
  mbaNumber: string
  progDisplayLineItems?: ProgrammaticLineItem[]
  progVideoLineItems?: ProgrammaticLineItem[]
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

type PacingSeriesPoint = {
  date: string
  actualSpend: number
  actualDeliverable: number
}

type PacingResult = {
  asAtDate: string | null
  spend: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  deliverable?: {
    actualToDate: number
    expectedToDate: number
    delta: number
    pacingPct: number
    goalTotal: number
  }
  series: PacingSeriesPoint[]
}

type LineItemMetrics = {
  lineItem: ProgrammaticLineItem
  pacing: PacingResult
  bursts: any[]
  window: { startISO?: string; endISO?: string; startDate: Date | null; endDate: Date | null }
  actualsDaily: Array<{
    date: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
    videoViews: number
    deliverable_value: number
  }>
  matchedRows: Dv360DailyRow[]
  booked: { spend: number; deliverables: number }
  delivered: { spend: number; deliverables: number }
  shouldToDate: { spend: number; deliverables: number }
  deliverableKey: "impressions" | "clicks" | "conversions" | "videoViews"
  targetMetric: "clicks" | "views" | null
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  onTrackStatus: OnTrackStatus
}

const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const IS_DEV = process.env.NODE_ENV !== "production"

function cleanId(v: any) {
  const s = String(v ?? "").trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === "undefined" || lower === "null") return null
  return lower
}

function extractProgrammaticLineItemId(item: ProgrammaticLineItem): string | null {
  const id = item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID
  return cleanId(id)
}

async function parseResponseJsonSafely(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    const text = await response.text()
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.slice(0, 200)}`)
  }
  return response.json()
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10)
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
  const diff = end.getTime() - start.getTime()
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

function parseBursts(raw: ProgrammaticLineItem["bursts"] | ProgrammaticLineItem["bursts_json"]): any[] {
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

function normalizeBurst(raw: Record<string, any>) {
  const startDate = raw.start_date || raw.startDate || raw.start || raw.beginDate || raw.begin_date || ""
  const endDate = raw.end_date || raw.endDate || raw.end || raw.stopDate || raw.stop_date || ""

  const budgetNumber = parseCurrency(
    raw.budget_number ?? raw.budget ?? raw.media_investment ?? raw.mediaInvestment ?? raw.buy_amount_number ?? raw.buyAmount
  )
  const calculatedValueNumber = parseCurrency(
    raw.calculated_value_number ?? raw.calculatedValue ?? raw.deliverables ?? raw.deliverable ?? raw.conversions
  )

  return {
    start_date: startDate,
    end_date: endDate,
    startDate,
    endDate,
    media_investment: Number.isFinite(budgetNumber) ? budgetNumber : 0,
    deliverables: Number.isFinite(calculatedValueNumber) ? calculatedValueNumber : 0,
    budget_number: Number.isFinite(budgetNumber) ? budgetNumber : 0,
    calculated_value_number: Number.isFinite(calculatedValueNumber) ? calculatedValueNumber : 0,
  }
}

function getLineItemWindow(bursts: any[], fallbackStart?: string, fallbackEnd?: string) {
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

function computeShouldToDateFromBursts(bursts: any[], asAtISO: string, kind: "spend" | "deliverables") {
  const asAtDate = parseDateSafe(asAtISO)
  if (!asAtDate) return 0

  return bursts.reduce((sum, burst) => {
    const burstStart = parseDateSafe(burst.start_date)
    const burstEnd = parseDateSafe(burst.end_date)
    if (!burstStart || !burstEnd) return sum

    const total = kind === "spend" ? burst.budget_number ?? burst.media_investment ?? 0 : burst.calculated_value_number ?? burst.deliverables ?? 0

    const duration = inclusiveDays(burstStart, burstEnd)
    if (duration <= 0) return sum

    if (asAtDate < burstStart) return sum
    const elapsedEnd = asAtDate > burstEnd ? burstEnd : asAtDate
    const elapsed = inclusiveDays(burstStart, elapsedEnd)
    const should = (total / duration) * elapsed
    return sum + should
  }, 0)
}

function mapCombinedRowToDv360(row: CombinedPacingRow): Dv360DailyRow {
  const channel = String(row.channel ?? "")
  if (channel !== "programmatic-display" && channel !== "programmatic-video") {
    throw new Error(`Unexpected channel for programmatic pacing: ${channel}`)
  }

  return {
    date: row.dateDay,
    lineItem: row.adsetName ?? null,
    insertionOrder: row.campaignName ?? null,
    spend: row.amountSpent ?? 0,
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    conversions: row.results ?? 0,
    videoViews: row.video3sViews ?? 0,
    matchedPostfix: row.lineItemId ? String(row.lineItemId).toLowerCase() : null,
  }
}

function sumBookedFromBursts(bursts: any[]) {
  return bursts.reduce(
    (acc, burst) => ({
      spend: acc.spend + parseCurrency(burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? burst.buyAmount),
      deliverables: acc.deliverables + parseCurrency(burst.calculated_value_number ?? burst.deliverables ?? burst.conversions),
    }),
    { spend: 0, deliverables: 0 }
  )
}

function summarizeActuals(
  rows: Array<{ spend: number; impressions: number; clicks: number; conversions: number; videoViews: number }>
) {
  const totals = rows.reduce(
    (acc, row) => ({
      spend: acc.spend + (row.spend ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      conversions: acc.conversions + (row.conversions ?? 0),
      videoViews: acc.videoViews + (row.videoViews ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, videoViews: 0 }
  )

  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cvr = totals.impressions ? (totals.conversions / totals.impressions) * 100 : 0
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cpa = totals.conversions ? totals.spend / totals.conversions : 0
  const cpv = totals.videoViews ? totals.spend / totals.videoViews : 0
  const viewRate = totals.impressions ? (totals.videoViews / totals.impressions) * 100 : 0

  return { ...totals, cpm, ctr, cvr, cpc, cpa, cpv, viewRate }
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

function formatPercent(value: number) {
  const num = Number(value)
  if (Number.isNaN(num)) return "0.00%"
  return `${num.toFixed(2)}%`
}

function buildCumulativeSeries(dates: string[], actualsDaily: LineItemMetrics["actualsDaily"]) {
  const map = new Map<string, (typeof actualsDaily)[number]>()
  actualsDaily.forEach((day) => map.set(day.date, day))

  return dates.map((date) => {
    const day = map.get(date)
    return {
      date,
      actualSpend: Number((day?.spend ?? 0).toFixed(2)),
      actualDeliverable: Number((day?.deliverable_value ?? 0).toFixed(2)),
    }
  })
}

function deriveDeliverableKey(
  buyType?: string | null,
  platform?: string | null
): LineItemMetrics["deliverableKey"] {
  const metric = mapDeliverableMetric({ channel: "programmatic", buyType, platform })
  switch (metric) {
    case "VIDEO_3S_VIEWS":
      return "videoViews"
    case "RESULTS":
      return "conversions"
    case "CLICKS":
      return "clicks"
    case "IMPRESSIONS":
    default:
      return "impressions"
  }
}

function targetMetricForProgrammaticDeliverable(
  deliverableKey: LineItemMetrics["deliverableKey"] | "deliverable_value" | null,
): "clicks" | "views" | null {
  switch (deliverableKey) {
    case "clicks":
      return "clicks"
    case "videoViews":
      return "views"
    default:
      return null
  }
}

function buildProgrammaticTargetCurveLineItem(
  item: ProgrammaticLineItem,
  bursts: any[],
  mediaType: "progdisplay" | "progvideo",
): TargetCurveLineItem | null {
  const publisher = String(
    (item as any)?.platform ??
      (item as any)?.site ??
      (item as any)?.publisher ??
      "",
  )
    .trim()
    .toLowerCase()
  const bidStrategy = String(
    (item as any)?.bid_strategy ??
      (item as any)?.bidStrategy ??
      (item as any)?.buy_type ??
      "",
  )
    .trim()
    .toLowerCase()
  const buyType = String((item as any)?.buy_type ?? "").trim().toLowerCase()

  const explicitDeliverables =
    Number(
      (item as any)?.goal_deliverable_total ??
        (item as any)?.deliverables_total ??
        0,
    ) || 0
  const burstDeliverables = bursts.reduce(
    (sum: number, b: any) =>
      sum +
      (Number(b?.deliverables ?? b?.deliverablesAmount ?? 0) || 0),
    0,
  )
  const deliverables = explicitDeliverables > 0 ? explicitDeliverables : burstDeliverables
  if (deliverables <= 0) return null

  let earliestStartISO: string | null = null
  let latestEndISO: string | null = null
  for (const b of bursts) {
    const start = b?.startISO ?? b?.start ?? b?.startDate ?? b?.start_date ?? null
    const end = b?.endISO ?? b?.end ?? b?.endDate ?? b?.end_date ?? null
    if (start && (!earliestStartISO || start < earliestStartISO)) earliestStartISO = start
    if (end && (!latestEndISO || end > latestEndISO)) latestEndISO = end
  }

  return {
    mediaType,
    publisher,
    bidStrategy,
    buyType,
    deliverables,
    earliestStartISO,
    latestEndISO,
  }
}

function buildProgrammaticLineItemMetrics(
  items: ProgrammaticLineItem[],
  apiRows: Dv360DailyRow[],
  campaignDateRange: string[],
  pacingAsAtISO: string,
  mediaType: "progdisplay" | "progvideo",
  kpiTargets: KPITargetsMap | undefined,
  campaignWindow: { startISO: string; endISO: string },
  fallbackStart?: string,
  fallbackEnd?: string,
): LineItemMetrics[] {
  return items.map((item) => {
    const bursts = item.bursts ?? parseBursts(item.bursts_json)
    const window = getLineItemWindow(bursts, fallbackStart, fallbackEnd)
    const targetId = extractProgrammaticLineItemId(item)

    const matched = apiRows.filter((row) => {
      if (!targetId) return false
      return row.matchedPostfix === targetId
    })

    const dateRange =
      campaignDateRange.length > 0
        ? campaignDateRange
        : window.startDate && window.endDate
          ? eachDay(window.startDate, window.endDate)
          : Array.from(new Set(matched.map((m) => m.date))).sort()

    const groupedByDate = new Map<
      string,
      { spend: number; impressions: number; clicks: number; conversions: number; videoViews: number }
    >()
    matched.forEach((row) => {
      const existing =
        groupedByDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, videoViews: 0 }
      groupedByDate.set(row.date, {
        spend: existing.spend + (row.spend ?? 0),
        impressions: existing.impressions + (row.impressions ?? 0),
        clicks: existing.clicks + (row.clicks ?? 0),
        conversions: existing.conversions + (row.conversions ?? 0),
        videoViews: existing.videoViews + (row.videoViews ?? 0),
      })
    })

    const deliverableKey = deriveDeliverableKey(item.buy_type, item.platform)

    const actualsDaily = dateRange.map((date) => {
      const day =
        groupedByDate.get(date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, videoViews: 0 }
      const deliverable_value =
        deliverableKey === "impressions"
          ? day.impressions
          : deliverableKey === "clicks"
            ? day.clicks
            : deliverableKey === "videoViews"
              ? day.videoViews
              : day.conversions
      return {
        date,
        spend: day.spend,
        impressions: day.impressions,
        clicks: day.clicks,
        conversions: day.conversions,
        videoViews: day.videoViews,
        deliverable_value,
      }
    })

    const asAtDate = pacingAsAtISO

    const deliveredTotals = actualsDaily.reduce(
      (acc, day) => {
        if (asAtDate && day.date > asAtDate) return acc
        return {
          spend: acc.spend + day.spend,
          deliverables: acc.deliverables + day.deliverable_value,
        }
      },
      { spend: 0, deliverables: 0 },
    )

    const hasSchedule = (bursts ?? []).length > 0
    const fallbackBurst: any[] =
      !hasSchedule && window.startISO && window.endISO
        ? [
            {
              start_date: window.startISO,
              end_date: window.endISO,
              media_investment: item.total_budget ?? 0,
              deliverables: item.goal_deliverable_total ?? 0,
              budget_number: item.total_budget ?? 0,
              calculated_value_number: item.goal_deliverable_total ?? 0,
            },
          ]
        : []
    const burstsToUse = hasSchedule ? bursts : fallbackBurst

    const booked = sumBookedFromBursts(burstsToUse ?? [])
    const shouldSpend = computeShouldToDateFromBursts(burstsToUse ?? [], asAtDate, "spend")
    const shouldDeliverables = computeShouldToDateFromBursts(burstsToUse ?? [], asAtDate, "deliverables")

    const pacing: PacingResult = {
      asAtDate,
      spend: {
        actualToDate: Number(deliveredTotals.spend.toFixed(2)),
        expectedToDate: Number(shouldSpend.toFixed(2)),
        delta: Number((deliveredTotals.spend - shouldSpend).toFixed(2)),
        pacingPct: Number((shouldSpend > 0 ? (deliveredTotals.spend / shouldSpend) * 100 : 0).toFixed(2)),
        goalTotal: Number(booked.spend.toFixed(2)),
      },
      series: buildCumulativeSeries(dateRange, actualsDaily),
    }

    pacing.deliverable = {
      actualToDate: Number(deliveredTotals.deliverables.toFixed(2)),
      expectedToDate: Number(shouldDeliverables.toFixed(2)),
      delta: Number((deliveredTotals.deliverables - shouldDeliverables).toFixed(2)),
      pacingPct: Number(
        (shouldDeliverables > 0 ? (deliveredTotals.deliverables / shouldDeliverables) * 100 : 0).toFixed(2),
      ),
      goalTotal: Number(booked.deliverables.toFixed(2)),
    }

    const targetMetric = targetMetricForProgrammaticDeliverable(deliverableKey)
    let targetCurve: TargetCurvePoint[] = []
    let cumulativeActual: Array<{ date: string; actual: number }> = []
    let onTrackStatus: OnTrackStatus = "no-data"

    if (
      targetMetric &&
      kpiTargets &&
      kpiTargets.size > 0 &&
      campaignWindow.startISO &&
      campaignWindow.endISO
    ) {
      const tcli = buildProgrammaticTargetCurveLineItem(item, burstsToUse ?? [], mediaType)
      if (tcli) {
        targetCurve = buildCumulativeTargetCurve({
          campaignStartISO: campaignWindow.startISO,
          campaignEndISO: campaignWindow.endISO,
          lineItems: [tcli],
          kpiTargets,
          metric: targetMetric,
          tolerance: 0.15,
        })
        if (targetCurve.length) {
          const dailyByDate = new Map<string, number>()
          for (const row of actualsDaily) {
            const dateKey = String((row as any).date ?? (row as any).day ?? "")
            if (!dateKey) continue
            const value =
              deliverableKey === "clicks"
                ? (row as any).clicks ?? 0
                : deliverableKey === "videoViews"
                  ? (row as any).videoViews ?? 0
                  : (row as any).deliverable_value ?? 0
            const prev = dailyByDate.get(dateKey) ?? 0
            dailyByDate.set(dateKey, prev + (Number(value) || 0))
          }
          cumulativeActual = buildCumulativeActualSeries(
            targetCurve.map((p) => p.date),
            dailyByDate,
          )
          const cumActualByDate = new Map(
            cumulativeActual.map((r) => [r.date, r.actual]),
          )
          const asAt = pacing.asAtDate ?? getMelbourneTodayISO()
          onTrackStatus = evaluateOnTrack(targetCurve, cumActualByDate, asAt)
        }
      }
    }

    return {
      lineItem: item,
      pacing,
      bursts: burstsToUse ?? [],
      window,
      actualsDaily,
      matchedRows: matched,
      booked,
      delivered: {
        spend: Number(deliveredTotals.spend.toFixed(2)),
        deliverables: Number(deliveredTotals.deliverables.toFixed(2)),
      },
      shouldToDate: {
        spend: Number(shouldSpend.toFixed(2)),
        deliverables: Number(shouldDeliverables.toFixed(2)),
      },
      deliverableKey,
      targetMetric,
      targetCurve,
      cumulativeActual,
      onTrackStatus,
    }
  })
}

function getDeliverableLabel(key: LineItemMetrics["deliverableKey"]) {
  switch (key) {
    case "clicks":
      return "Clicks"
    case "conversions":
      return "Conversions"
    case "videoViews":
      return "Video Views"
    case "impressions":
    default:
      return "Impressions"
  }
}

function buildAggregatedMetrics(
  lineItemMetrics: LineItemMetrics[],
  asAtDate: string | undefined,
  campaignStartISO: string,
  campaignEndISO: string
): PacingResult {
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

  const actualMap = new Map<
    string,
    { spend: number; deliverable: number }
  >()
  lineItemMetrics.forEach((metric) => {
    metric.actualsDaily.forEach((day) => {
      const existing = actualMap.get(day.date) ?? { spend: 0, deliverable: 0 }
      actualMap.set(day.date, {
        spend: existing.spend + (day.spend ?? 0),
        deliverable: existing.deliverable + (day.deliverable_value ?? 0),
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
      conversions: Number(values.deliverable.toFixed(2)),
      videoViews: 0,
      deliverable_value: Number(values.deliverable.toFixed(2)),
    }
  })

  const asAt = asAtDate ?? null
  const deliveredTotals = aggregateActuals.reduce(
    (acc, day) => {
      if (asAt && day.date > asAt) return acc
      return {
        spend: acc.spend + (day.spend ?? 0),
        deliverables: acc.deliverables + (day.deliverable_value ?? 0),
      }
    },
    { spend: 0, deliverables: 0 }
  )

  const bookedTotals = {
    spend: Number(
      lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0).toFixed(2)
    ),
    deliverables: Number(
      lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0).toFixed(2)
    ),
  }

  const shouldAt = asAt ?? campaignEndISO
  const shouldSpend = Number(
    lineItemMetrics
      .reduce(
        (sum, m) => sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "spend"),
        0
      )
      .toFixed(2)
  )
  const shouldDeliverables = Number(
    lineItemMetrics
      .reduce(
        (sum, m) =>
          sum + computeShouldToDateFromBursts(m.bursts, shouldAt, "deliverables"),
        0
      )
      .toFixed(2)
  )

  const spendPacing = shouldSpend > 0 ? (deliveredTotals.spend / shouldSpend) * 100 : 0
  const deliverablePacing =
    shouldDeliverables > 0 ? (deliveredTotals.deliverables / shouldDeliverables) * 100 : 0

  return {
    asAtDate: asAt ?? null,
    spend: {
      actualToDate: Number(deliveredTotals.spend.toFixed(2)),
      expectedToDate: shouldSpend,
      delta: Number((deliveredTotals.spend - shouldSpend).toFixed(2)),
      pacingPct: Number(spendPacing.toFixed(2)),
      goalTotal: bookedTotals.spend,
    },
    deliverable: {
      actualToDate: Number(deliveredTotals.deliverables.toFixed(2)),
      expectedToDate: shouldDeliverables,
      delta: Number((deliveredTotals.deliverables - shouldDeliverables).toFixed(2)),
      pacingPct: Number(deliverablePacing.toFixed(2)),
      goalTotal: bookedTotals.deliverables,
    },
    series: buildCumulativeSeries(dateRange, aggregateActuals),
  }
}

function ActualsDailyDeliveryChart({
  series,
  asAtDate,
  deliverableLabel,
  chartRef,
  brandColour,
}: {
  series: PacingSeriesPoint[]
  asAtDate: string | null
  deliverableLabel: string
  chartRef?: React.Ref<HTMLDivElement>
  brandColour?: string
}) {
  const spendName = "Actual spend"
  const delName = `${deliverableLabel} actual`
  const { spendColor, deliverableColor } = React.useMemo(() => {
    const m = assignEntityColors([spendName, delName], "generic")
    return { spendColor: brandColour ?? m.get(spendName)!, deliverableColor: m.get(delName)! }
  }, [delName, brandColour])
  const refLineISO = asAtDate ?? getMelbourneTodayISO()
  const showAsAtLine = React.useMemo(
    () => Boolean(refLineISO && series.some((p) => p.date === refLineISO)),
    [series, refLineISO]
  )

  return (
    <div className="space-y-2">
      <ChartContainer
        config={{
          spendActual: { label: spendName, color: spendColor },
          deliverableActual: { label: delName, color: deliverableColor },
        }}
        className="h-[320px] w-full"
        ref={chartRef}
      >
        <LineChart data={series} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
          tickFormatter={(v) => formatCurrency(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatWholeNumber(v)}
        />
        <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
        <Line
          type="monotone"
          yAxisId="left"
          dataKey="actualSpend"
          name={spendName}
          stroke={spendColor}
          strokeWidth={2.6}
          dot={false}
          cursor="default"
          activeDot={{ r: 4, stroke: spendColor, strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          yAxisId="right"
          dataKey="actualDeliverable"
          name={delName}
          stroke={deliverableColor}
          strokeWidth={2.4}
          dot={false}
          cursor="default"
          activeDot={{ r: 4, stroke: deliverableColor, strokeWidth: 1 }}
        />
        {showAsAtLine ? (
          <ReferenceLine yAxisId="left" x={refLineISO} {...PACING_TODAY_REFERENCE_LINE_PROPS} />
        ) : null}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as PacingSeriesPoint
            return (
              <div className="animate-in fade-in-0 zoom-in-95 duration-150">
                <div className={cn("w-72", PACING_TOOLTIP_SHELL_CLASS)}>
                  <p className="mb-2 truncate text-sm font-semibold text-foreground">
                    {point.date ? formatDateAU(point.date) : "—"}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: spendColor }} />
                        <span className="truncate">{spendName}</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                        {formatCurrency(point.actualSpend)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: deliverableColor }} />
                        <span className="truncate">{delName}</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                        {formatWholeNumber(point.actualDeliverable)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-border/80 pt-2 text-xs text-muted-foreground">
                    As at {asAtDate ?? "—"}
                  </p>
                </div>
              </div>
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
  showVideoViews = false,
}: {
  daily: LineItemMetrics["actualsDaily"]
  showVideoViews?: boolean
}) {
  if (!daily.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        No daily delivery data available
      </div>
    )
  }

  const COLS = showVideoViews
    ? "120px 120px 140px 120px 120px 120px 140px"
    : "120px 120px 140px 120px 120px 120px"

  const sorted = [...daily].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const totals = sorted.reduce(
    (acc, row) => ({
      spend: acc.spend + (row.spend ?? 0),
      deliverables: acc.deliverables + (row.deliverable_value ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      conversions: acc.conversions + (row.conversions ?? 0),
      videoViews: acc.videoViews + (row.videoViews ?? 0),
    }),
    { spend: 0, deliverables: 0, impressions: 0, clicks: 0, conversions: 0, videoViews: 0 }
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
            <div className="text-right">Conversions</div>
            {showVideoViews ? <div className="text-right">Video Views</div> : null}
          </div>
        </div>

        {sorted.map((row, ri) => (
          <div
            key={String(row.date)}
            className={cn(
              "grid items-center border-b px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-muted/30",
              ri % 2 === 1 ? "bg-muted/15" : "bg-background"
            )}
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="font-medium">{formatDateAU(row.date)}</div>
            <div className="text-right">{formatCurrency(row.spend)}</div>
            <div className="text-right">{formatWholeNumber(row.deliverable_value)}</div>
            <div className="text-right">{formatNumber(row.impressions)}</div>
            <div className="text-right">{formatNumber(row.clicks)}</div>
            <div className="text-right">{formatNumber(row.conversions)}</div>
            {showVideoViews ? <div className="text-right">{formatNumber(row.videoViews ?? 0)}</div> : null}
          </div>
        ))}

        <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/95 px-3 py-2 text-sm font-semibold backdrop-blur">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Totals</div>
            <div className="text-right">{formatCurrency(totals.spend)}</div>
            <div className="text-right">{formatWholeNumber(totals.deliverables)}</div>
            <div className="text-right">{formatNumber(totals.impressions)}</div>
            <div className="text-right">{formatNumber(totals.clicks)}</div>
            <div className="text-right">{formatNumber(totals.conversions)}</div>
            {showVideoViews ? <div className="text-right">{formatNumber(totals.videoViews)}</div> : null}
          </div>
        </div>
    </div>
  )
}

function KpiCallouts({ totals }: { totals: ReturnType<typeof summarizeActuals> }) {
  const cards: Array<{
    label: string
    value: string
    pill1Label: string
    pill1Value: string
    pill2Label: string
    pill2Value: string
  }> = [
    {
      label: "Impressions",
      value: formatNumber(totals.impressions),
      pill1Label: "CPM",
      pill1Value: formatCurrency2dp(totals.cpm),
      pill2Label: "CTR",
      pill2Value: formatPercent(totals.ctr),
    },
    {
      label: "Clicks",
      value: formatNumber(totals.clicks),
      pill1Label: "CTR",
      pill1Value: formatPercent(totals.ctr),
      pill2Label: "CPC",
      pill2Value: formatCurrency2dp(totals.cpc),
    },
    {
      label: "Conversions",
      value: formatNumber(totals.conversions),
      pill1Label: "CVR",
      pill1Value: formatPercent(totals.cvr),
      pill2Label: "CPA",
      pill2Value: formatCurrency2dp(totals.cpa),
    },
    {
      label: "Video Views",
      value: formatNumber(totals.videoViews),
      pill1Label: "View rate",
      pill1Value: formatPercent(totals.viewRate),
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
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none"
              >
                {card.pill1Label} {card.pill1Value}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none"
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

type PanelKind = "display" | "video"

export default function ProgrammaticDeliveryContainer({
  clientSlug,
  mbaNumber,
  progDisplayLineItems,
  progVideoLineItems,
  campaignStart,
  campaignEnd,
  initialPacingRows,
  deliveryLineItemIds,
  brandColour,
  clientFacingLabels = true,
  kpiTargets,
}: ProgrammaticDeliveryContainerProps): React.ReactElement | null {
  const c = (client: string, agency: string) => (clientFacingLabels ? client : agency)
  const StatusBadge = clientFacingLabels ? DeliveryStatusBadge : PacingStatusBadge
  const { toast } = useToast()
  const { user, isLoading: authLoading } = useUser()
  const [pacingRows, setPacingRows] = useState<CombinedPacingRow[]>(initialPacingRows ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingFetchKeyRef = useRef<string | null>(null)
  const lastSuccessfulFetchKeyRef = useRef<string | null>(null)
  const retryCountRef = useRef<number>(0)
  const cancelledRef = useRef<boolean>(false)

  // Filter rows where channel === 'programmatic-display' and map to Dv360DailyRow
  const displayRows = useMemo(() => {
    if (!Array.isArray(pacingRows)) return []
    return pacingRows
      .filter((row) => row.channel === "programmatic-display")
      .map(mapCombinedRowToDv360)
  }, [pacingRows])

  // Filter rows where channel === 'programmatic-video' and map to Dv360DailyRow
  const videoRows = useMemo(() => {
    if (!Array.isArray(pacingRows)) return []
    return pacingRows
      .filter((row) => row.channel === "programmatic-video")
      .map(mapCombinedRowToDv360)
  }, [pacingRows])

  const resolvedCampaignStart = campaignStart
  const resolvedCampaignEnd = campaignEnd

  // REFACTORED: Normalize line items directly from props
  const normalizedDisplay = useMemo(
    (): ProgrammaticLineItem[] =>
      (progDisplayLineItems ?? [])
        .filter((item) => {
          const platform = String(item.platform ?? "").toLowerCase()
          return platform === "dv360" || platform === "youtube - dv360" || platform === "youtube-dv360"
        })
        .flatMap((item) => {
          const id = extractProgrammaticLineItemId(item)
          if (!id) return []
          return [{
            ...item,
            line_item_id: id,
            bursts: parseBursts(item.bursts ?? item.bursts_json),
          }]
        }),
    [progDisplayLineItems]
  )

  const normalizedVideo = useMemo(
    (): ProgrammaticLineItem[] =>
      (progVideoLineItems ?? [])
        .filter((item) => {
          const platform = String(item.platform ?? "").toLowerCase()
          return platform === "dv360" || platform === "youtube - dv360" || platform === "youtube-dv360"
        })
        .flatMap((item) => {
          const id = extractProgrammaticLineItemId(item)
          if (!id) return []
          return [{
            ...item,
            line_item_id: id,
            bursts: parseBursts(item.bursts ?? item.bursts_json),
          }]
        }),
    [progVideoLineItems]
  )

  const programmaticLineItemIds = useMemo(() => {
    const idsFromItems = [...normalizedDisplay, ...normalizedVideo]
      .map((item) => extractProgrammaticLineItemId(item))
      .filter(Boolean) as string[]
    const uniqueItems = Array.from(new Set(idsFromItems))
    if (!deliveryLineItemIds?.length) {
      return uniqueItems
    }
    const pacingSet = new Set(
      deliveryLineItemIds.map((id) => cleanId(id)).filter(Boolean) as string[]
    )
    return uniqueItems.filter((id) => pacingSet.has(id))
  }, [normalizedDisplay, normalizedVideo, deliveryLineItemIds])

  // Stable string key for dependency tracking
  const idsKey = useMemo(() => programmaticLineItemIds.join(","), [programmaticLineItemIds])

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

      const data = await parseResponseJsonSafely(response)

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
    if (!programmaticLineItemIds.length) {
      if (IS_DEV || DEBUG_PACING) {
        console.log("[PACING UI] Skipping fetch - no line item IDs", {
          idsKey,
          idsCount: programmaticLineItemIds.length,
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
        idsCount: programmaticLineItemIds.length,
        sampleIds: programmaticLineItemIds.slice(0, 10),
        pacingRange: {
          start: pacingWindow.campaignStartISO,
          end: pacingWindow.campaignEndISO,
        },
        fetchKey,
      })
    }
    
    // Set pending key immediately before calling fetch
    pendingFetchKeyRef.current = fetchKey
    // Note: lastSuccessfulFetchKeyRef will be set inside fetchPacingData on success

    fetchPacingData(
      mbaNumber,
      programmaticLineItemIds,
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
    programmaticLineItemIds,
    initialPacingRows,
    fetchPacingData,
  ])

  const campaignDateSeries = useMemo(() => {
    const cs = parseDateSafe(resolvedCampaignStart)
    const ce = parseDateSafe(resolvedCampaignEnd)
    if (!cs || !ce) return []
    return eachDay(cs, ce)
  }, [resolvedCampaignStart, resolvedCampaignEnd])

  const displayMetrics = useMemo(
    () =>
      buildProgrammaticLineItemMetrics(
        normalizedDisplay,
        displayRows,
        campaignDateSeries,
        pacingWindow.asAtISO,
        "progdisplay",
        kpiTargets,
        {
          startISO: pacingWindow.campaignStartISO,
          endISO: pacingWindow.campaignEndISO,
        },
        resolvedCampaignStart,
        resolvedCampaignEnd,
      ),
    [
      normalizedDisplay,
      displayRows,
      campaignDateSeries,
      pacingWindow.asAtISO,
      kpiTargets,
      pacingWindow.campaignStartISO,
      pacingWindow.campaignEndISO,
      resolvedCampaignStart,
      resolvedCampaignEnd,
    ],
  )
  const videoMetrics = useMemo(
    () =>
      buildProgrammaticLineItemMetrics(
        normalizedVideo,
        videoRows,
        campaignDateSeries,
        pacingWindow.asAtISO,
        "progvideo",
        kpiTargets,
        {
          startISO: pacingWindow.campaignStartISO,
          endISO: pacingWindow.campaignEndISO,
        },
        resolvedCampaignStart,
        resolvedCampaignEnd,
      ),
    [
      normalizedVideo,
      videoRows,
      campaignDateSeries,
      pacingWindow.asAtISO,
      kpiTargets,
      pacingWindow.campaignStartISO,
      pacingWindow.campaignEndISO,
      resolvedCampaignStart,
      resolvedCampaignEnd,
    ],
  )

  const aggregateDisplay = useMemo(
    () =>
      buildAggregatedMetrics(
        displayMetrics,
        pacingWindow.asAtISO,
        campaignStart,
        campaignEnd
      ),
    [displayMetrics, pacingWindow.asAtISO, campaignStart, campaignEnd]
  )
  const aggregateVideo = useMemo(
    () =>
      buildAggregatedMetrics(
        videoMetrics,
        pacingWindow.asAtISO,
        campaignStart,
        campaignEnd
      ),
    [videoMetrics, pacingWindow.asAtISO, campaignStart, campaignEnd]
  )

  const aggregateDisplayTargetCurve: TargetCurvePoint[] = useMemo(() => {
    if (!kpiTargets || kpiTargets.size === 0) return []
    if (!displayMetrics.length) return []
    if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

    const tclis: TargetCurveLineItem[] = []
    for (const metric of displayMetrics) {
      if (metric.targetMetric !== "clicks") continue
      const tcli = buildProgrammaticTargetCurveLineItem(
        metric.lineItem,
        metric.bursts,
        "progdisplay",
      )
      if (tcli) tclis.push(tcli)
    }
    if (!tclis.length) return []

    return buildCumulativeTargetCurve({
      campaignStartISO: pacingWindow.campaignStartISO,
      campaignEndISO: pacingWindow.campaignEndISO,
      lineItems: tclis,
      kpiTargets,
      metric: "clicks",
      tolerance: 0.15,
    })
  }, [kpiTargets, displayMetrics, pacingWindow.campaignStartISO, pacingWindow.campaignEndISO])

  const aggregateDisplayCumulativeActual = useMemo(() => {
    if (!aggregateDisplayTargetCurve.length) return []
    const dailyByDate = new Map<string, number>()
    for (const metric of displayMetrics) {
      if (metric.targetMetric !== "clicks") continue
      for (const row of metric.actualsDaily) {
        const dateKey = String((row as any).date ?? (row as any).day ?? "")
        if (!dateKey) continue
        const value = (row as any).clicks ?? 0
        const prev = dailyByDate.get(dateKey) ?? 0
        dailyByDate.set(dateKey, prev + (Number(value) || 0))
      }
    }
    return buildCumulativeActualSeries(
      aggregateDisplayTargetCurve.map((p) => p.date),
      dailyByDate,
    )
  }, [aggregateDisplayTargetCurve, displayMetrics])

  const aggregateDisplayOnTrackStatus: OnTrackStatus = useMemo(() => {
    if (!aggregateDisplayTargetCurve.length) return "no-data"
    const cumActualByDate = new Map(
      aggregateDisplayCumulativeActual.map((r) => [r.date, r.actual]),
    )
    const asAt = aggregateDisplay?.asAtDate ?? getMelbourneTodayISO()
    return evaluateOnTrack(aggregateDisplayTargetCurve, cumActualByDate, asAt)
  }, [aggregateDisplayTargetCurve, aggregateDisplayCumulativeActual, aggregateDisplay])

  const aggregateVideoTargetCurve: TargetCurvePoint[] = useMemo(() => {
    if (!kpiTargets || kpiTargets.size === 0) return []
    if (!videoMetrics.length) return []
    if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

    const tclis: TargetCurveLineItem[] = []
    for (const metric of videoMetrics) {
      if (metric.targetMetric !== "views") continue
      const tcli = buildProgrammaticTargetCurveLineItem(
        metric.lineItem,
        metric.bursts,
        "progvideo",
      )
      if (tcli) tclis.push(tcli)
    }
    if (!tclis.length) return []

    return buildCumulativeTargetCurve({
      campaignStartISO: pacingWindow.campaignStartISO,
      campaignEndISO: pacingWindow.campaignEndISO,
      lineItems: tclis,
      kpiTargets,
      metric: "views",
      tolerance: 0.15,
    })
  }, [kpiTargets, videoMetrics, pacingWindow.campaignStartISO, pacingWindow.campaignEndISO])

  const aggregateVideoCumulativeActual = useMemo(() => {
    if (!aggregateVideoTargetCurve.length) return []
    const dailyByDate = new Map<string, number>()
    for (const metric of videoMetrics) {
      if (metric.targetMetric !== "views") continue
      for (const row of metric.actualsDaily) {
        const dateKey = String((row as any).date ?? (row as any).day ?? "")
        if (!dateKey) continue
        const value = (row as any).videoViews ?? 0
        const prev = dailyByDate.get(dateKey) ?? 0
        dailyByDate.set(dateKey, prev + (Number(value) || 0))
      }
    }
    return buildCumulativeActualSeries(
      aggregateVideoTargetCurve.map((p) => p.date),
      dailyByDate,
    )
  }, [aggregateVideoTargetCurve, videoMetrics])

  const aggregateVideoOnTrackStatus: OnTrackStatus = useMemo(() => {
    if (!aggregateVideoTargetCurve.length) return "no-data"
    const cumActualByDate = new Map(
      aggregateVideoCumulativeActual.map((r) => [r.date, r.actual]),
    )
    const asAt = aggregateVideo?.asAtDate ?? getMelbourneTodayISO()
    return evaluateOnTrack(aggregateVideoTargetCurve, cumActualByDate, asAt)
  }, [aggregateVideoTargetCurve, aggregateVideoCumulativeActual, aggregateVideo])

  const displayBookedTotals = useMemo(
    () => ({
      spend: Number(displayMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0).toFixed(2)),
      deliverables: Number(displayMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0).toFixed(2)),
    }),
    [displayMetrics]
  )

  const videoBookedTotals = useMemo(
    () => ({
      spend: Number(videoMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0).toFixed(2)),
      deliverables: Number(videoMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0).toFixed(2)),
    }),
    [videoMetrics]
  )

  const aggregateDisplayChartRef = useRef<HTMLDivElement | null>(null)
  const aggregateVideoChartRef = useRef<HTMLDivElement | null>(null)
  const lineChartRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [aggregateDisplayChartMode, setAggregateDisplayChartMode] = useState<"cumulative" | "daily">(
    clientFacingLabels ? "cumulative" : "daily",
  )
  const [aggregateVideoChartMode, setAggregateVideoChartMode] = useState<"cumulative" | "daily">(
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

  const setLineChartRef = (id: string) => (node: HTMLDivElement | null) => {
    lineChartRefs.current[id] = node
  }

  const sanitizeFilename = (value: string) =>
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "programmatic"

  async function handleExportCSVs(kind: PanelKind) {
    const isDisplay = kind === "display"
    const metrics = isDisplay ? displayMetrics : videoMetrics
    const aggregate = isDisplay ? aggregateDisplay : aggregateVideo
    const rows = isDisplay ? displayRows : videoRows

    const base = `${kind === "display" ? "prog-display" : "prog-video"}-${sanitizeFilename(clientSlug)}-${sanitizeFilename(mbaNumber)}`
    const aggregateSeries = aggregate.series.map((point) => ({
      date: point.date,
      actual_spend: point.actualSpend,
      expected_spend: 0,
      actual_deliverable: point.actualDeliverable,
      expected_deliverable: 0,
    }))

    const perLineSeries = metrics.flatMap((metric) =>
      metric.pacing.series.map((point) => ({
        line_item_id: metric.lineItem.line_item_id,
        line_item_name: metric.lineItem.line_item_name,
        date: point.date,
        actual_spend: point.actualSpend,
        expected_spend: 0,
        actual_deliverable: point.actualDeliverable,
        expected_deliverable: 0,
      }))
    )

    const deliveryRows = rows.map((row) => ({ ...row }))

    downloadCSV(aggregateSeries, `${base}-aggregate-series`)
    setTimeout(() => downloadCSV(perLineSeries, `${base}-line-item-series`), 150)
    setTimeout(() => downloadCSV(deliveryRows, `${base}-delivery-rows`), 300)
  }

  async function exportElementPng(el: HTMLElement, filename: string) {
    const html2canvas = (await import("html2canvas")).default
    const canvas = await html2canvas(el, {
      backgroundColor: CHART_NEUTRAL.surface,
      scale: 2,
    })
    const dataUrl = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = `${filename}.png`
    link.click()
  }

  async function handleExportCharts(kind: PanelKind) {
    const isDisplay = kind === "display"
    const metrics = isDisplay ? displayMetrics : videoMetrics
    const aggregateRef = isDisplay ? aggregateDisplayChartRef : aggregateVideoChartRef

    const base = `${kind === "display" ? "prog-display" : "prog-video"}-${sanitizeFilename(clientSlug)}-${sanitizeFilename(mbaNumber)}`
    const targets: Array<{ el: HTMLElement | null; name: string }> = [
      { el: aggregateRef.current, name: `${base}-aggregate-chart` },
      ...metrics.map((metric) => ({
        el: lineChartRefs.current[String(metric.lineItem.line_item_id)],
        name: `${base}-${sanitizeFilename(metric.lineItem.line_item_id ?? "line-item")}-chart`,
      })),
    ]

    for (const target of targets) {
      if (target.el) {
        await exportElementPng(target.el, target.name)
        await new Promise((res) => setTimeout(res, 120))
      }
    }
  }

  const handleSyncNow = () => {
    window.location.reload()
  }

  const hasAnyData = displayMetrics.length > 0 || videoMetrics.length > 0

  const handleCopyAggregateSeries = async () => {
    const payload: {
      programmaticDisplay?: (typeof aggregateDisplay)["series"]
      programmaticVideo?: (typeof aggregateVideo)["series"]
    } = {}
    if (displayMetrics.length) payload.programmaticDisplay = aggregateDisplay.series
    if (videoMetrics.length) payload.programmaticVideo = aggregateVideo.series
    await navigator.clipboard.writeText(JSON.stringify(payload))
    toast({ title: "Copied", description: "Aggregate chart series copied." })
  }

  const handleExportAllCsv = async () => {
    if (displayMetrics.length) {
      await handleExportCSVs("display")
    }
    if (videoMetrics.length) {
      await new Promise((res) => setTimeout(res, 400))
      await handleExportCSVs("video")
    }
  }

  const handleExportAllPng = async () => {
    if (displayMetrics.length) {
      await handleExportCharts("display")
    }
    if (videoMetrics.length) {
      await new Promise((res) => setTimeout(res, 200))
      await handleExportCharts("video")
    }
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
        onClick={() => void handleExportAllCsv()}
        disabled={isLoading || !hasAnyData}
        title="Export CSV"
      >
        <FileSpreadsheet className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => void handleExportAllPng()}
        disabled={isLoading || !hasAnyData}
        title="Export PNG"
      >
        <ImageDown className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => void handleCopyAggregateSeries()}
        disabled={isLoading || !hasAnyData}
        title="Copy chart data"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </>
  )

  function renderKindSection(kind: PanelKind, aggregateChartRef: React.RefObject<HTMLDivElement | null>) {
    const isDisplay = kind === "display"
    const metrics = isDisplay ? displayMetrics : videoMetrics
    const aggregate = isDisplay ? aggregateDisplay : aggregateVideo
    const bookedTotals = isDisplay ? displayBookedTotals : videoBookedTotals
    const label = isDisplay ? "Prog Display" : "Prog Video"
    const aggregateChartMode = isDisplay ? aggregateDisplayChartMode : aggregateVideoChartMode
    const setAggregateChartMode = isDisplay ? setAggregateDisplayChartMode : setAggregateVideoChartMode
    const aggregateTargetCurve = isDisplay ? aggregateDisplayTargetCurve : aggregateVideoTargetCurve
    const aggregateCumulativeActual = isDisplay ? aggregateDisplayCumulativeActual : aggregateVideoCumulativeActual
    const aggregateOnTrackStatus = isDisplay ? aggregateDisplayOnTrackStatus : aggregateVideoOnTrackStatus
    const aggregateDeliverableLabel = isDisplay ? "Clicks" : "Views"
    const progAggregateAccent = assignEntityColors(["Actual spend", "Deliverables actual"], "generic")
    const spendAccent = brandColour ?? progAggregateAccent.get("Actual spend")!
    const sectionActuals = summarizeActuals(metrics.flatMap((m) => m.actualsDaily))

    if (!metrics.length) {
      if (!isLoading && !error) {
        return null
      }
    }

    return (
      <div className="space-y-6">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>

        {!isLoading ? (
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Total spend</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency(aggregate.spend.actualToDate)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Impressions</p>
              <p className="text-sm font-semibold text-foreground">{formatNumber(sectionActuals.impressions)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Avg CPM</p>
              <p className="text-sm font-semibold text-foreground">
                {sectionActuals.impressions > 0 ? formatCurrency2dp(sectionActuals.cpm) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{c("Budget delivery", "Budget pacing")}</p>
              <p className="text-sm font-semibold text-foreground">{aggregate.spend.pacingPct.toFixed(1)}%</p>
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
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SmallProgressCard
                label={c("Spend delivery", "Spend pacing")}
                value={formatCurrency(aggregate.spend.actualToDate)}
                helper={`Delivered ${formatCurrency(aggregate.spend.actualToDate)} • Planned ${formatCurrency(bookedTotals.spend)}`}
                pacingPct={aggregate.spend.pacingPct}
                progressRatio={
                  bookedTotals.spend > 0
                    ? Math.max(0, Math.min(1, aggregate.spend.actualToDate / bookedTotals.spend))
                    : 0
                }
                accentColor={spendAccent}
                clientFacingLabels={clientFacingLabels}
                embedded
              />
              <SmallProgressCard
                label={c("Deliverable delivery", "Deliverable pacing")}
                value={formatWholeNumber(aggregate.deliverable?.actualToDate)}
                helper={`Delivered ${formatWholeNumber(aggregate.deliverable?.actualToDate)} • Planned ${formatWholeNumber(bookedTotals.deliverables)}`}
                pacingPct={aggregate.deliverable?.pacingPct}
                progressRatio={
                  bookedTotals.deliverables > 0
                    ? Math.max(
                        0,
                        Math.min(1, (aggregate.deliverable?.actualToDate ?? 0) / bookedTotals.deliverables)
                      )
                    : 0
                }
                accentColor={progAggregateAccent.get("Deliverables actual")!}
                clientFacingLabels={clientFacingLabels}
                embedded
              />
            </div>

            <DeliverySubCard
              icon={LayoutDashboard}
              title="Delivery KPIs"
              subtitle="Impressions, clicks, conversions & views"
            >
              <KpiCallouts totals={sectionActuals} />
            </DeliverySubCard>
            <DeliverySubCard
              icon={LineChartIcon}
              title={
                aggregateChartMode === "cumulative" &&
                clientFacingLabels &&
                aggregateTargetCurve.length > 0
                  ? `${label}: Cumulative ${aggregateDeliverableLabel} vs target`
                  : "Aggregate delivery chart"
              }
              subtitle={`Deliverable type: ${aggregateDeliverableLabel}`}
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
                  asAtDate={aggregate.asAtDate}
                  deliverableLabel={aggregateDeliverableLabel}
                  chartRef={aggregateChartRef}
                  brandColour={brandColour}
                />
              ) : (
                <ActualsDailyDeliveryChart
                  series={aggregate.series}
                  asAtDate={aggregate.asAtDate}
                  deliverableLabel={aggregateDeliverableLabel}
                  chartRef={aggregateChartRef}
                  brandColour={brandColour}
                />
              )}
            </DeliverySubCard>

            <Accordion type="multiple" defaultValue={[]}>
              {metrics.map((metric, accIdx) => {
                const spendPacing = metric.pacing.spend.pacingPct ?? 0
                const pacingTone = pacingDeviationBorderClass(spendPacing)
                const sparklineTone = pacingDeviationSparklineClass(spendPacing)
                const delLbl = getDeliverableLabel(metric.deliverableKey)
                const lineId = String(metric.lineItem.line_item_id)
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
                        <div className="grid w-full grid-cols-[1fr_auto] items-center gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={cn("h-[28px] w-[80px]", sparklineTone)}>
                              <Sparkline data={metric.pacing.series.map((p) => Number(p.actualSpend ?? 0))} height={28} />
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="truncate font-medium">
                                {metric.lineItem.line_item_name || metric.lineItem.line_item_id || "Line item"}
                              </span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {metric.lineItem.buy_type || "—"}
                              </span>
                            </div>
                          </div>
                          <Badge className="rounded-full bg-muted px-3 py-1 text-[11px] text-foreground">
                            {formatCurrency(metric.lineItem.total_budget)}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          {(() => {
                            const delActualName = `${delLbl} actual`
                            const liAccent = assignEntityColors(["Actual spend", delActualName], "generic")
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
                                  accentColor={brandColour ?? liAccent.get("Actual spend")!}
                                  clientFacingLabels={clientFacingLabels}
                                  embedded
                                />
                                <SmallProgressCard
                                  label={c(`${delLbl} delivery`, `${delLbl} pacing`)}
                                  value={formatWholeNumber(metric.pacing.deliverable?.actualToDate)}
                                  helper={`Delivered ${formatWholeNumber(metric.pacing.deliverable?.actualToDate)} ${delLbl} • Booked ${formatWholeNumber(metric.booked.deliverables)} ${delLbl}`}
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
                                  accentColor={liAccent.get(delActualName)!}
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
                          subtitle={`${delLbl} efficiency`}
                        >
                          <KpiCallouts totals={summarizeActuals(metric.actualsDaily)} />
                        </DeliverySubCard>
                        <DeliverySubCard
                          icon={LineChartIcon}
                          title={
                            getLineItemChartMode(lineId) === "cumulative" &&
                            clientFacingLabels &&
                            metric.targetCurve.length > 0
                              ? `Cumulative ${delLbl} vs target`
                              : `Daily ${delLbl} + spend`
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
                              deliverableLabel={delLbl}
                              chartRef={setLineChartRef(lineId)}
                              brandColour={brandColour}
                            />
                          ) : (
                            <ActualsDailyDeliveryChart
                              series={metric.pacing.series}
                              asAtDate={metric.pacing.asAtDate}
                              deliverableLabel={delLbl}
                              chartRef={setLineChartRef(lineId)}
                              brandColour={brandColour}
                            />
                          )}
                        </DeliverySubCard>
                        <DeliverySubCard icon={Table} title="Daily delivery" subtitle="Spend and metrics by day">
                          <DeliveryTable daily={metric.actualsDaily} showVideoViews={kind === "video"} />
                        </DeliverySubCard>
                      </AccordionContent>
                    </div>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </>
        )}
      </div>
    )
  }

  if (!normalizedDisplay.length && !normalizedVideo.length) {
    return null
  }

  return (
    <DeliveryCard
      icon={MonitorPlay}
      title={c("Programmatic delivery", "Programmatic Pacing")}
      subtitle={`${formatDateAU(campaignStart)} – ${formatDateAU(campaignEnd)}`}
      actions={pacingCardActions}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
            {clientSlug} • {mbaNumber}
          </Badge>
        </div>

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

        {renderKindSection("display", aggregateDisplayChartRef)}
        {renderKindSection("video", aggregateVideoChartRef)}

        {DEBUG_PACING ? (
          <DeliverySubCard icon={LayoutDashboard} title={c("Delivery debug", "Pacing debug")} subtitle="Development only">
            <div className="text-sm text-muted-foreground">
              <div>Display line items: {normalizedDisplay.length}</div>
              <div>Video line items: {normalizedVideo.length}</div>
              <div className="mt-1">
                <span className="font-medium text-foreground">Rows</span>: display {displayRows.length} • video{" "}
                {videoRows.length}
              </div>
            </div>
          </DeliverySubCard>
        ) : null}
      </div>
    </DeliveryCard>
  )
}
