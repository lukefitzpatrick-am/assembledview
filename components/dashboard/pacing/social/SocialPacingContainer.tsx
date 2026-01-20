"use client"

import { useMemo, useRef } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, XAxis, YAxis, LineChart, Line } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { SmallProgressCard } from "@/components/dashboard/pacing/SmallProgressCard"
import {
  PacingResult,
  PacingSeriesPoint,
  getDeliverableKey,
} from "@/lib/pacing/calcPacing"
import type { ActualsDaily, BuyType, Burst } from "@/lib/pacing/mockMetaPacing"
import {
  MetaPacingRow,
  normalisePlatform,
  summariseDelivery,
} from "@/lib/pacing/social/metaPacing"
import { downloadCSV } from "@/lib/utils/csv-export"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"

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

type SocialPacingContainerProps = {
  clientSlug: string
  mbaNumber: string
  socialLineItems?: SocialLineItem[]
  snowflakeDeliveryRows?: MetaPacingRow[]
  campaignStart?: string
  campaignEnd?: string
  initialPacingRows?: CombinedPacingRow[]
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
}

const palette = {
  budget: "#4f8fcb",
  deliverable: "#15c7c9",
}

const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

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

const deliverableMapping: Record<string, "impressions" | "clicks" | "results" | "video_3s_views" | null> = {
  cpm: "impressions",
  cpc: "clicks",
  cpa: "results",
  leads: "results",
  cpv: "video_3s_views",
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
    maximumFractionDigits: 0,
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

function resolveDeliverableKey(buyType: string | undefined): ReturnType<typeof getDeliverableKey> {
  if (!buyType) return null
  const normalized = buyType.toLowerCase()
  if (deliverableMapping[normalized]) return deliverableMapping[normalized]
  return getDeliverableKey(normalized.toUpperCase() as BuyType)
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
  asAtDate?: string
): LineItemMetrics["pacing"] {
  const startDates = lineItemMetrics.map((m) => m.window.startDate).filter(Boolean) as Date[]
  const endDates = lineItemMetrics.map((m) => m.window.endDate).filter(Boolean) as Date[]

  if (!startDates.length || !endDates.length) {
    return {
      asAtDate: asAtDate ?? null,
      spend: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      deliverable: { actualToDate: 0, expectedToDate: 0, delta: 0, pacingPct: 0, goalTotal: 0 },
      series: [],
    }
  }

  const startDate = new Date(Math.min(...startDates.map((d) => d.getTime())))
  const endDate = new Date(Math.max(...endDates.map((d) => d.getTime())))
  const dateRange = eachDay(startDate, endDate)

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

  const asAt = asAtDate ?? (dateRange.length ? dateRange[dateRange.length - 1] : null)
  const delivered = sumDeliveredUpToDate(aggregateActuals, "deliverable_value", asAt)

  const bookedTotals = {
    spend: round2(lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0)),
    deliverables: round2(
      lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0)
    ),
  }

  const shouldSpend = round2(
    lineItemMetrics.reduce(
      (sum, m) => sum + computeShouldToDateFromBursts(m.bursts, asAt ?? toISO(new Date()), "spend"),
      0
    )
  )
  const shouldDeliverables = round2(
    lineItemMetrics.reduce(
      (sum, m) =>
        sum + computeShouldToDateFromBursts(m.bursts, asAt ?? toISO(new Date()), "deliverables"),
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
}: {
  series: PacingSeriesPoint[]
  asAtDate: string | null
  deliverableLabel: string
  chartRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <ChartContainer
      config={{
        spendActual: { label: "Actual spend", color: palette.budget },
        deliverableActual: { label: `${deliverableLabel} actual`, color: palette.deliverable },
      }}
      className="h-[320px] w-full"
      ref={chartRef}
    >
      <LineChart data={series} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.12} stroke="hsl(var(--muted-foreground))" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
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
          name="Actual spend"
          stroke={palette.budget}
          strokeWidth={2.6}
          dot={false}
          activeDot={{ r: 4, stroke: palette.budget, strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          yAxisId="right"
          dataKey="actualDeliverable"
          name={`${deliverableLabel} actual`}
          stroke={palette.deliverable}
          strokeWidth={2.4}
          dot={false}
          activeDot={{ r: 4, stroke: palette.deliverable, strokeWidth: 1 }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as PacingSeriesPoint
            const dateLabel = point.date ? formatDateAU(point.date) : null
            return (
              <div className="min-w-[220px] rounded-md border bg-popover p-3 shadow-md text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold leading-tight">Daily delivery</div>
                  {dateLabel ? (
                    <div className="text-[11px] text-muted-foreground">{dateLabel}</div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <span>Actual spend</span>
                    <span className="font-medium">{formatCurrency(point.actualSpend)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>{deliverableLabel} actual</span>
                    <span className="font-medium">{formatWholeNumber(point.actualDeliverable)}</span>
                  </div>
                  <div className="pt-2 text-[10px] text-muted-foreground">As at {asAtDate ?? "—"}</div>
                </div>
              </div>
            )
          }}
        />
      </LineChart>
    </ChartContainer>
  )
}

function DeliveryTable({ rows }: { rows: MetaPacingRow[] }) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No delivery rows matched to this line item yet.</div>
  }

  const COLS =
    "120px minmax(200px, 1fr) minmax(220px, 1fr) 120px 120px 120px 120px 120px"

  const sorted = [...rows].sort((a, b) => a.dateDay.localeCompare(b.dateDay))
  const derivedRows = sorted.map((row) => deriveDeliveryRow(row))

  const totals = derivedRows.reduce(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      results: acc.results + row.results,
      video3sViews: acc.video3sViews + row.video3sViews,
    }),
    { spend: 0, impressions: 0, clicks: 0, results: 0, video3sViews: 0 }
  )
  const totalsRow = {
    dateDay: "Totals",
    campaignName: "—",
    adsetName: "",
    spend: totals.spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    results: totals.results,
    video3sViews: totals.video3sViews,
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <div className="sticky top-0 z-10 bg-muted/70 backdrop-blur border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Date</div>
            <div>Campaign</div>
            <div>Ad set</div>
            <div className="text-right">Spend</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">Results</div>
            <div className="text-right">3s Views</div>
          </div>
        </div>

        {derivedRows.map((row, idx) => (
          <div
            key={`${row.dateDay}-${row.adsetName}-${idx}`}
            className="grid items-center border-b last:border-b-0 px-3 py-2 text-sm"
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="font-medium">{row.dateDay}</div>
            <div className="truncate">{row.campaignName}</div>
            <div className="truncate">{row.adsetName}</div>
            <div className="text-right">{formatCurrency(row.spend)}</div>
            <div className="text-right">{formatNumber(row.impressions)}</div>
            <div className="text-right">{formatNumber(row.clicks)}</div>
            <div className="text-right">{formatNumber(row.results)}</div>
            <div className="text-right">{formatNumber(row.video3sViews)}</div>
          </div>
        ))}

        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t px-3 py-2 text-sm font-semibold">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>{totalsRow.dateDay}</div>
            <div>{totalsRow.campaignName}</div>
            <div>{totalsRow.adsetName}</div>
            <div className="text-right">{formatCurrency(totalsRow.spend)}</div>
            <div className="text-right">{formatNumber(totalsRow.impressions)}</div>
            <div className="text-right">{formatNumber(totalsRow.clicks)}</div>
            <div className="text-right">{formatNumber(totalsRow.results)}</div>
            <div className="text-right">{formatNumber(totalsRow.video3sViews)}</div>
          </div>
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
      value: formatNumber(totals.results),
      pill1Label: "CVR",
      pill1Value: formatPercent(totals.cvr),
      pill2Label: "CPA",
      pill2Value: formatCurrency2dp(totals.cost_per_result),
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
        <Card key={card.label} className="rounded-2xl border-muted/70 shadow-sm">
          <CardContent className="flex flex-col gap-1.5 p-3 sm:p-3.5">
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
            <div className="text-3xl font-semibold leading-tight">{card.value}</div>
          </CardContent>
        </Card>
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

export default function SocialPacingContainer({
  clientSlug,
  mbaNumber,
  socialLineItems,
  campaignStart,
  campaignEnd,
  initialPacingRows,
}: SocialPacingContainerProps) {
  // Filter initialPacingRows by channel using useMemo - no client-side fetching
  const metaRows = useMemo(() => {
    if (!Array.isArray(initialPacingRows)) return []
    return initialPacingRows
      .filter((row) => row.channel === "meta")
      .map(mapCombinedRowToMeta)
  }, [initialPacingRows])

  const tiktokRows = useMemo(() => {
    if (!Array.isArray(initialPacingRows)) return []
    return initialPacingRows
      .filter((row) => row.channel === "tiktok")
      .map(mapCombinedRowToMeta)
  }, [initialPacingRows])

  // Combine rows for filtering in lineItemMetrics
  const socialRows = useMemo(() => [...metaRows, ...tiktokRows], [metaRows, tiktokRows])

  // Data is already available from server - no loading state needed
  const isLoading = false

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

  const metaRanges = useMemo(
    () =>
      metaItems.map((item) => ({
        lineItemId: cleanId(item.line_item_id),
        ...resolveLineItemRange(item, resolvedCampaignStart, resolvedCampaignEnd),
      })),
    [metaItems, resolvedCampaignStart, resolvedCampaignEnd]
  )

  const tiktokRanges = useMemo(
    () =>
      tiktokItems.map((item) => ({
        lineItemId: cleanId(item.line_item_id),
        fallbackName:
          (item as any).line_item_name ||
          (item as any).creative_targeting ||
          (item as any).creative ||
          (item.platform ?? ""),
        ...resolveLineItemRange(item, resolvedCampaignStart, resolvedCampaignEnd),
      })),
    [tiktokItems, resolvedCampaignStart, resolvedCampaignEnd]
  )

  const metaQueryRange = useMemo(() => {
    const starts = metaRanges.map((rangeItem) => rangeItem.start).filter(Boolean) as string[]
    const ends = metaRanges.map((rangeItem) => rangeItem.end).filter(Boolean) as string[]
    const start = starts.length ? starts.sort()[0] : resolvedCampaignStart
    const end = ends.length ? ends.sort().slice(-1)[0] : resolvedCampaignEnd
    return { start, end }
  }, [metaRanges, resolvedCampaignStart, resolvedCampaignEnd])

  const tiktokQueryRange = useMemo(() => {
    const starts = tiktokRanges.map((rangeItem) => rangeItem.start).filter(Boolean) as string[]
    const ends = tiktokRanges.map((rangeItem) => rangeItem.end).filter(Boolean) as string[]
    const start = starts.length ? starts.sort()[0] : resolvedCampaignStart
    const end = ends.length ? ends.sort().slice(-1)[0] : resolvedCampaignEnd
    return { start, end }
  }, [tiktokRanges, resolvedCampaignStart, resolvedCampaignEnd])

  const lineItemMetrics: LineItemMetrics[] = useMemo(() => {
    const activeItems = [...metaItems, ...tiktokItems]
    if (!activeItems.length) return []
    const today = startOfDay(new Date())
    const todayISO = toISO(today)

    return activeItems.map((item) => {
      const bursts = item.bursts ?? parseBursts(item.bursts_json)
      const window = getLineItemWindow(bursts, resolvedCampaignStart, resolvedCampaignEnd)
      const targetId = cleanId(item.line_item_id)
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
        window.startISO,
        window.endISO,
        today
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
      const deliverableKey = resolveDeliverableKey(item.buy_type)

      const dailyLookup = new Map<string, (typeof deliverySummary.daily)[number]>()
      deliverySummary.daily.forEach((day) => dailyLookup.set(day.dateDay, day))

      const dateRange =
        window.startDate && window.endDate
          ? eachDay(window.startDate, window.endDate)
          : Array.from(dailyLookup.keys()).sort()

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

      const asAtDate = window.endDate
        ? toISO(new Date(Math.min(today.getTime(), window.endDate.getTime())))
        : todayISO

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
      }
    })
  }, [metaItems, tiktokItems, socialRows, resolvedCampaignStart, resolvedCampaignEnd, metaRows, tiktokRows, mbaNumber])

  const aggregateAsAtDate = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = resolvedCampaignEnd ?? metaQueryRange.end ?? tiktokQueryRange.end
    if (endDate) {
      const clamped = new Date(Math.min(today.getTime(), new Date(endDate).getTime()))
      return clamped.toISOString().slice(0, 10)
    }
    return today.toISOString().slice(0, 10)
  }, [resolvedCampaignEnd, metaQueryRange.end, tiktokQueryRange.end])

  const aggregatePacing = useMemo(
    () => buildAggregatedMetrics(lineItemMetrics, aggregateAsAtDate),
    [lineItemMetrics, aggregateAsAtDate]
  )
  const bookedTotals = useMemo(() => {
    return {
      spend: round2(lineItemMetrics.reduce((s, m) => s + (m.booked?.spend ?? 0), 0)),
      deliverables: round2(
        lineItemMetrics.reduce((s, m) => s + (m.booked?.deliverables ?? 0), 0)
      ),
    }
  }, [lineItemMetrics])

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

    downloadCSV(aggregateSeries, `${base}-aggregate-series`)
    setTimeout(() => downloadCSV(perLineSeries, `${base}-line-item-series`), 150)
    setTimeout(() => downloadCSV(deliveryRows, `${base}-delivery-rows`), 300)
  }

  async function exportElementPng(el: HTMLElement, filename: string) {
    const html2canvas = (await import("html2canvas")).default
    const canvas = await html2canvas(el, {
      // Use a light background so exports aren't dark in PNG
      backgroundColor: "#ffffff",
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

    for (const target of targets) {
      if (target.el) {
        await exportElementPng(target.el, target.name)
        await new Promise((res) => setTimeout(res, 120))
      }
    }
  }

  return (
    <Card className="rounded-3xl border-muted/70 bg-background/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Social Performance</CardTitle>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
              {clientSlug} • {mbaNumber}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSVs}>
              Export CSVs
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCharts}>
              Export charts (PNG)
            </Button>
          </div>
        </div>
        {/* Description removed per request */}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SmallProgressCard
              label="Budget pacing"
              value={formatCurrency(aggregatePacing.spend.actualToDate)}
              helper={`Delivered ${formatCurrency(aggregatePacing.spend.actualToDate)} • Planned ${formatCurrency(bookedTotals.spend)}`}
              pacingPct={aggregatePacing.spend.pacingPct}
              progressRatio={
                bookedTotals.spend > 0
                  ? Math.max(0, Math.min(1, aggregatePacing.spend.actualToDate / bookedTotals.spend))
                  : 0
              }
              accentColor={palette.budget}
            />
            <SmallProgressCard
              label="Deliverable pacing"
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
              accentColor={palette.deliverable}
            />
          </div>
        )}

        {!isLoading ? (
          <div className="space-y-4 rounded-2xl border border-muted/60 bg-muted/10 p-4">
            <KpiCallouts
              totals={summarizeActuals(lineItemMetrics.flatMap((metric) => metric.actualsDaily))}
            />
            <ActualsDailyDeliveryChart
              series={aggregatePacing.series}
              asAtDate={aggregatePacing.asAtDate}
              deliverableLabel="Deliverables"
              chartRef={aggregateChartRef}
            />
          </div>
        ) : (
          <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
        )}

        {DEBUG_PACING ? (
          <div className="rounded-2xl border border-dashed border-muted/70 bg-background/80 p-3 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground mb-1">Pacing debug</div>
            <div>Meta line items: {debugSummary.metaCount}</div>
            <div>TikTok line items: {debugSummary.tiktokCount}</div>
            <div className="mt-1">
              <span className="font-medium text-foreground">Rows</span>: meta {debugSummary.metaRowCount} • tiktok {debugSummary.tiktokRowCount}
            </div>
            <div className="mt-2">
              {debugSummary.perItem.length ? (
                <ul className="space-y-1">
                  {debugSummary.perItem.map((item) => (
                    <li key={item.id}>
                      <span className="text-foreground font-medium">{item.name || item.id}</span>{" "}
                      ({item.platform || "?"}) target {item.targetId || "—"} → matched {item.matched} (id {item.matchedById})
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
        ) : null}

        <Accordion type="multiple" defaultValue={[]}>
          {lineItemMetrics.map((metric) => (
            <AccordionItem key={metric.lineItem.line_item_id} value={String(metric.lineItem.line_item_id)}>
              <AccordionTrigger className="rounded-xl px-3 py-2 text-left text-sm font-semibold">
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex flex-col text-left">
                    <span>{formatLineItemHeader(metric.lineItem)}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {metric.lineItem.buy_type || "—"}
                    </span>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    {formatCurrency(metric.lineItem.total_budget)}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SmallProgressCard
                    label="Budget pacing"
                    value={formatCurrency(metric.pacing.spend.actualToDate)}
                    helper={`Delivered ${formatCurrency(metric.pacing.spend.actualToDate)} • Booked ${formatCurrency(metric.booked.spend)}`}
                    pacingPct={metric.pacing.spend.pacingPct}
                    progressRatio={
                      metric.booked.spend > 0
                        ? Math.max(0, Math.min(1, metric.pacing.spend.actualToDate / metric.booked.spend))
                        : 0
                    }
                    accentColor={palette.budget}
                  />
                  <SmallProgressCard
                    label="Deliverable pacing"
                    value={formatWholeNumber(metric.pacing.deliverable?.actualToDate)}
                    helper={`Delivered ${formatWholeNumber(metric.pacing.deliverable?.actualToDate)} • Booked ${formatWholeNumber(metric.booked.deliverables)}`}
                    pacingPct={metric.pacing.deliverable?.pacingPct}
                    progressRatio={
                      metric.booked.deliverables > 0
                        ? Math.max(
                            0,
                            Math.min(
                              1,
                              (metric.pacing.deliverable?.actualToDate ?? 0) /
                                metric.booked.deliverables
                            )
                          )
                        : 0
                    }
                    accentColor={palette.deliverable}
                  />
                </div>
                <div className="space-y-3 rounded-2xl border border-muted/60 bg-muted/10 p-3">
                  <KpiCallouts totals={summarizeActuals(metric.actualsDaily)} />
                  <ActualsDailyDeliveryChart
                    series={metric.pacing.series}
                    asAtDate={metric.pacing.asAtDate}
                    deliverableLabel="Deliverables"
                    chartRef={setLineChartRef(String(metric.lineItem.line_item_id))}
                  />
                </div>
                <DeliveryTable rows={metric.matchedRows} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
