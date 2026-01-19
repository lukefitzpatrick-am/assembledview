"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart"
import { SmallProgressCard } from "@/components/dashboard/pacing/SmallProgressCard"
import { downloadCSV } from "@/lib/utils/csv-export"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { Dv360DailyRow } from "@/lib/pacing/dv360/dv360Pacing"

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

type ProgrammaticPacingContainerProps = {
  clientSlug: string
  mbaNumber: string
  progDisplayLineItems?: ProgrammaticLineItem[]
  progVideoLineItems?: ProgrammaticLineItem[]
  campaignStart?: string
  campaignEnd?: string
  initialPacingRows?: CombinedPacingRow[]
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
    deliverable_value: number
  }>
  matchedRows: Dv360DailyRow[]
  booked: { spend: number; deliverables: number }
  delivered: { spend: number; deliverables: number }
  shouldToDate: { spend: number; deliverables: number }
  deliverableKey: "impressions" | "clicks" | "conversions" | null
}

const palette = {
  budget: "#4f8fcb",
  deliverable: "#15c7c9",
}

const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

const deliverableMapping: Record<string, "impressions" | "clicks" | "conversions" | null> = {
  cpm: "impressions",
  cpc: "clicks",
  cpa: "conversions",
}

function cleanId(v: any) {
  const s = String(v ?? "").trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === "undefined" || lower === "null") return null
  return lower
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

function resolveLineItemRange(item: ProgrammaticLineItem, fallbackStart?: string, fallbackEnd?: string) {
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

function summarizeActuals(rows: Array<{ spend: number; impressions: number; clicks: number; conversions: number }>) {
  const totals = rows.reduce(
    (acc, row) => ({
      spend: acc.spend + (row.spend ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      conversions: acc.conversions + (row.conversions ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  )

  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cvr = totals.impressions ? (totals.conversions / totals.impressions) * 100 : 0
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cpa = totals.conversions ? totals.spend / totals.conversions : 0

  return { ...totals, cpm, ctr, cvr, cpc, cpa }
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

function deriveDeliverableKey(buyType?: string | null) {
  if (!buyType) return null
  const normalized = String(buyType).toLowerCase()
  return deliverableMapping[normalized] ?? null
}

function buildAggregatedMetrics(lineItemMetrics: LineItemMetrics[], asAtDate?: string): PacingResult {
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
      deliverable_value: Number(values.deliverable.toFixed(2)),
    }
  })

  const asAt = asAtDate ?? (dateRange.length ? dateRange[dateRange.length - 1] : null)
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

  const shouldSpend = Number(
    lineItemMetrics
      .reduce(
        (sum, m) => sum + computeShouldToDateFromBursts(m.bursts, asAt ?? toISO(new Date()), "spend"),
        0
      )
      .toFixed(2)
  )
  const shouldDeliverables = Number(
    lineItemMetrics
      .reduce(
        (sum, m) =>
          sum + computeShouldToDateFromBursts(m.bursts, asAt ?? toISO(new Date()), "deliverables"),
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

function DeliveryTable({ rows }: { rows: Dv360DailyRow[] }) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No delivery rows matched to this line item yet.</div>
  }

  const COLS = "120px minmax(200px, 1fr) minmax(200px, 1fr) 120px 120px 120px 120px"

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  const totals = sorted.reduce(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      conversions: acc.conversions + row.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  )

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <div className="sticky top-0 z-10 bg-muted/70 backdrop-blur border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Date</div>
            <div>Line item</div>
            <div>Insertion order</div>
            <div className="text-right">Spend</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">Conversions</div>
          </div>
        </div>

        {sorted.map((row, idx) => (
          <div
            key={`${row.date}-${row.lineItem}-${idx}`}
            className="grid items-center border-b last:border-b-0 px-3 py-2 text-sm"
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="font-medium">{formatDateAU(row.date)}</div>
            <div className="truncate">{row.lineItem || "—"}</div>
            <div className="truncate">{row.insertionOrder || "—"}</div>
            <div className="text-right">{formatCurrency(row.spend)}</div>
            <div className="text-right">{formatNumber(row.impressions)}</div>
            <div className="text-right">{formatNumber(row.clicks)}</div>
            <div className="text-right">{formatNumber(row.conversions)}</div>
          </div>
        ))}

        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t px-3 py-2 text-sm font-semibold">
          <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
            <div>Totals</div>
            <div>—</div>
            <div>—</div>
            <div className="text-right">{formatCurrency(totals.spend)}</div>
            <div className="text-right">{formatNumber(totals.impressions)}</div>
            <div className="text-right">{formatNumber(totals.clicks)}</div>
            <div className="text-right">{formatNumber(totals.conversions)}</div>
          </div>
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
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

type PanelKind = "display" | "video"

export default function ProgrammaticPacingContainer({
  clientSlug,
  mbaNumber,
  progDisplayLineItems,
  progVideoLineItems,
  campaignStart,
  campaignEnd,
  initialPacingRows,
}: ProgrammaticPacingContainerProps) {
  const initialProgrammatic = useMemo(() => {
    if (!Array.isArray(initialPacingRows)) return { display: [] as Dv360DailyRow[], video: [] as Dv360DailyRow[] }
    const display: Dv360DailyRow[] = []
    const video: Dv360DailyRow[] = []
    initialPacingRows.forEach((row) => {
      if (row.channel === "programmatic-display") {
        display.push(mapCombinedRowToDv360(row))
      } else if (row.channel === "programmatic-video") {
        video.push(mapCombinedRowToDv360(row))
      }
    })
    return { display, video }
  }, [initialPacingRows])

  const [resolvedDisplayItems, setResolvedDisplayItems] = useState<ProgrammaticLineItem[]>(progDisplayLineItems ?? [])
  const [resolvedVideoItems, setResolvedVideoItems] = useState<ProgrammaticLineItem[]>(progVideoLineItems ?? [])
  const [resolvedCampaignStart, setResolvedCampaignStart] = useState<string | undefined>(campaignStart)
  const [resolvedCampaignEnd, setResolvedCampaignEnd] = useState<string | undefined>(campaignEnd)
  const [displayRows, setDisplayRows] = useState<Dv360DailyRow[]>(initialProgrammatic.display)
  const [videoRows, setVideoRows] = useState<Dv360DailyRow[]>(initialProgrammatic.video)
  const [displayDateSeries, setDisplayDateSeries] = useState<string[]>([])
  const [videoDateSeries, setVideoDateSeries] = useState<string[]>([])
  const [isDisplayLoading, setIsDisplayLoading] = useState(false)
  const [isVideoLoading, setIsVideoLoading] = useState(false)
  const [displayError, setDisplayError] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const displayFetchKeyRef = useRef<string | null>(null)
  const videoFetchKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const providedDisplay = progDisplayLineItems !== undefined
    const providedVideo = progVideoLineItems !== undefined
    if (providedDisplay || providedVideo) {
      if (providedDisplay) setResolvedDisplayItems(progDisplayLineItems ?? [])
      if (providedVideo) setResolvedVideoItems(progVideoLineItems ?? [])
      setResolvedCampaignStart(campaignStart)
      setResolvedCampaignEnd(campaignEnd)
      return
    }

    let cancelled = false
    const loadMba = async () => {
      try {
        const res = await fetch(`/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const lineItemsMap = (data?.lineItems ?? {}) as Record<string, any[]>
        if (lineItemsMap?.progDisplay) {
          setResolvedDisplayItems(Array.isArray(lineItemsMap.progDisplay) ? lineItemsMap.progDisplay : [])
        }
        if (lineItemsMap?.progVideo) {
          setResolvedVideoItems(Array.isArray(lineItemsMap.progVideo) ? lineItemsMap.progVideo : [])
        }
        const campaign = data?.campaign ?? data ?? {}
        const start =
          campaign?.campaign_start_date ??
          campaign?.mp_campaigndates_start ??
          campaign?.start_date ??
          resolvedCampaignStart ??
          campaignStart
        const end =
          campaign?.campaign_end_date ??
          campaign?.mp_campaigndates_end ??
          campaign?.end_date ??
          resolvedCampaignEnd ??
          campaignEnd
        setResolvedCampaignStart(start)
        setResolvedCampaignEnd(end)
      } catch (err) {
        if (!cancelled) {
          console.error("[ProgrammaticPacing] fallback MBA fetch failed", err)
        }
      }
    }

    loadMba()
    return () => {
      cancelled = true
    }
  }, [progDisplayLineItems, progVideoLineItems, campaignStart, campaignEnd, mbaNumber])

  const normalizedDisplay = useMemo(
    () =>
      resolvedDisplayItems
        .filter((item) => {
          const platform = String(item.platform ?? "").toLowerCase()
          return platform === "dv360" || platform === "youtube - dv360" || platform === "youtube-dv360"
        })
        .map((item) => ({
          ...item,
          line_item_id: cleanId(item.line_item_id),
          bursts: parseBursts(item.bursts ?? item.bursts_json),
        })),
    [resolvedDisplayItems]
  )

  const normalizedVideo = useMemo(
    () =>
      resolvedVideoItems
        .filter((item) => {
          const platform = String(item.platform ?? "").toLowerCase()
          return platform === "dv360" || platform === "youtube - dv360" || platform === "youtube-dv360"
        })
        .map((item) => ({
          ...item,
          line_item_id: cleanId(item.line_item_id),
          bursts: parseBursts(item.bursts ?? item.bursts_json),
        })),
    [resolvedVideoItems]
  )

  const displayRanges = useMemo(
    () =>
      normalizedDisplay.map((item) => ({
        id: item.line_item_id,
        ...resolveLineItemRange(item, resolvedCampaignStart, resolvedCampaignEnd),
      })),
    [normalizedDisplay, resolvedCampaignStart, resolvedCampaignEnd]
  )

  const videoRanges = useMemo(
    () =>
      normalizedVideo.map((item) => ({
        id: item.line_item_id,
        ...resolveLineItemRange(item, resolvedCampaignStart, resolvedCampaignEnd),
      })),
    [normalizedVideo, resolvedCampaignStart, resolvedCampaignEnd]
  )

  const displayQueryRange = useMemo(() => {
    const starts = displayRanges.map((r) => r.start).filter(Boolean) as string[]
    const ends = displayRanges.map((r) => r.end).filter(Boolean) as string[]
    const start = starts.length ? starts.sort()[0] : resolvedCampaignStart
    const end = ends.length ? ends.sort().slice(-1)[0] : resolvedCampaignEnd
    return { start, end }
  }, [displayRanges, resolvedCampaignStart, resolvedCampaignEnd])

  const videoQueryRange = useMemo(() => {
    const starts = videoRanges.map((r) => r.start).filter(Boolean) as string[]
    const ends = videoRanges.map((r) => r.end).filter(Boolean) as string[]
    const start = starts.length ? starts.sort()[0] : resolvedCampaignStart
    const end = ends.length ? ends.sort().slice(-1)[0] : resolvedCampaignEnd
    return { start, end }
  }, [videoRanges, resolvedCampaignStart, resolvedCampaignEnd])

  useEffect(() => {
    if (!mbaNumber) return
    const displayIds = displayRanges.map((r) => r.id).filter(Boolean) as string[]
    const videoIds = videoRanges.map((r) => r.id).filter(Boolean) as string[]
    if (!displayQueryRange.start && !videoQueryRange.start) return
    const displayController = new AbortController()
    const videoController = new AbortController()
    let cancelled = false

    const loadDisplay = async () => {
      if (!displayIds.length || !displayQueryRange.start || !displayQueryRange.end) return
      setDisplayError(null)
      setIsDisplayLoading(true)
      const t0 = Date.now()
      try {
        const res = await fetch("/api/pacing/programmatic/display", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: displayController.signal,
          body: JSON.stringify({
            mbaNumber,
            lineItemIds: displayIds,
            startDate: displayQueryRange.start,
            endDate: displayQueryRange.end,
          }),
        })
        if (!res.ok) {
          throw new Error(`Display pacing request failed with ${res.status}`)
        }
        const data = await res.json()
        if (!cancelled) {
          const mapped = Array.isArray(data?.rows)
            ? data.rows.map((row: any) => ({
                ...row,
                matchedPostfix: cleanId(row.matchedPostfix ?? row.line_item_id ?? row.lineItem ?? row.lineItemId),
              }))
            : []
          setDisplayRows(mapped)
          setDisplayDateSeries(Array.isArray(data?.dateSeries) ? data.dateSeries : [])
          if (DEBUG_PACING) {
            console.log("[ProgrammaticPacing] display fetch ms/rows", {
              mbaNumber,
              elapsedMs: Date.now() - t0,
              rowCount: mapped.length,
            })
          }
        }
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name === "AbortError") return
        if (!cancelled) {
          console.error("[ProgrammaticPacing] display pacing fetch failed", err)
          setDisplayError("Unable to load programmatic display pacing right now.")
        }
      } finally {
        if (!cancelled) {
          setIsDisplayLoading(false)
        }
      }
    }

    const loadVideo = async () => {
      if (!videoIds.length || !videoQueryRange.start || !videoQueryRange.end) return
      setVideoError(null)
      setIsVideoLoading(true)
      const t0 = Date.now()
      try {
        const res = await fetch("/api/pacing/programmatic/video", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: videoController.signal,
          body: JSON.stringify({
            mbaNumber,
            lineItemIds: videoIds,
            startDate: videoQueryRange.start,
            endDate: videoQueryRange.end,
          }),
        })
        if (!res.ok) {
          throw new Error(`Video pacing request failed with ${res.status}`)
        }
        const data = await res.json()
        if (!cancelled) {
          const mapped = Array.isArray(data?.rows)
            ? data.rows.map((row: any) => ({
                ...row,
                matchedPostfix: cleanId(row.matchedPostfix ?? row.line_item_id ?? row.lineItem ?? row.lineItemId),
              }))
            : []
          setVideoRows(mapped)
          setVideoDateSeries(Array.isArray(data?.dateSeries) ? data.dateSeries : [])
          if (DEBUG_PACING) {
            console.log("[ProgrammaticPacing] video fetch ms/rows", {
              mbaNumber,
              elapsedMs: Date.now() - t0,
              rowCount: mapped.length,
            })
          }
        }
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name === "AbortError") return
        if (!cancelled) {
          console.error("[ProgrammaticPacing] video pacing fetch failed", err)
          setVideoError("Unable to load programmatic video pacing right now.")
        }
      } finally {
        if (!cancelled) {
          setIsVideoLoading(false)
        }
      }
    }

    const displayKey = displayIds.length && displayQueryRange.start && displayQueryRange.end
      ? `${mbaNumber}|display|${displayQueryRange.start}|${displayQueryRange.end}|${displayIds.join(",")}`
      : null
    const videoKey = videoIds.length && videoQueryRange.start && videoQueryRange.end
      ? `${mbaNumber}|video|${videoQueryRange.start}|${videoQueryRange.end}|${videoIds.join(",")}`
      : null

    const shouldFetchDisplay =
      displayIds.length > 0 &&
      !isDisplayLoading &&
      displayKey !== displayFetchKeyRef.current &&
      Boolean(displayQueryRange.start && displayQueryRange.end)
    const shouldFetchVideo =
      videoIds.length > 0 &&
      !isVideoLoading &&
      videoKey !== videoFetchKeyRef.current &&
      Boolean(videoQueryRange.start && videoQueryRange.end)

    if (shouldFetchDisplay) {
      loadDisplay()
      displayFetchKeyRef.current = displayKey
    }
    if (shouldFetchVideo) {
      loadVideo()
      videoFetchKeyRef.current = videoKey
    }

    return () => {
      cancelled = true
      displayController.abort()
      videoController.abort()
    }
  }, [
    mbaNumber,
    normalizedDisplay.length,
    normalizedVideo.length,
    displayRanges,
    videoRanges,
    displayQueryRange.start,
    displayQueryRange.end,
    videoQueryRange.start,
    videoQueryRange.end,
    isDisplayLoading,
    isVideoLoading,
  ])

  useEffect(() => {
    setDisplayError(null)
    setVideoError(null)
    if (displayQueryRange.start && displayQueryRange.end) {
      setDisplayDateSeries(eachDay(new Date(displayQueryRange.start), new Date(displayQueryRange.end)))
    } else {
      setDisplayDateSeries([])
    }
    if (videoQueryRange.start && videoQueryRange.end) {
      setVideoDateSeries(eachDay(new Date(videoQueryRange.start), new Date(videoQueryRange.end)))
    } else {
      setVideoDateSeries([])
    }
    setDisplayRows(initialProgrammatic.display)
    setVideoRows(initialProgrammatic.video)
    setIsDisplayLoading(false)
    setIsVideoLoading(false)
  }, [
    displayQueryRange.start,
    displayQueryRange.end,
    videoQueryRange.start,
    videoQueryRange.end,
    initialProgrammatic.display,
    initialProgrammatic.video,
  ])

  function buildLineItemMetrics(
    items: ProgrammaticLineItem[],
    apiRows: Dv360DailyRow[],
    dateSeries: string[],
    fallbackStart?: string,
    fallbackEnd?: string
  ): LineItemMetrics[] {
    const today = startOfDay(new Date())
    const todayISO = toISO(today)

    return items.map((item) => {
      const bursts = item.bursts ?? parseBursts(item.bursts_json)
      const window = getLineItemWindow(bursts, fallbackStart, fallbackEnd)
      const targetId = cleanId(item.line_item_id)

      const matched = apiRows.filter((row) => {
        if (!targetId) return false
        return row.matchedPostfix === targetId
      })

      const dateRange =
        window.startDate && window.endDate
          ? eachDay(window.startDate, window.endDate)
          : dateSeries.length
            ? dateSeries
            : Array.from(new Set(matched.map((m) => m.date))).sort()

      const groupedByDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>()
      matched.forEach((row) => {
        const existing = groupedByDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
        groupedByDate.set(row.date, {
          spend: existing.spend + (row.spend ?? 0),
          impressions: existing.impressions + (row.impressions ?? 0),
          clicks: existing.clicks + (row.clicks ?? 0),
          conversions: existing.conversions + (row.conversions ?? 0),
        })
      })

      const deliverableKey = deriveDeliverableKey(item.buy_type) ?? "conversions"

      const actualsDaily = dateRange.map((date) => {
        const day = groupedByDate.get(date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
        const deliverable_value =
          deliverableKey === "impressions"
            ? day.impressions
            : deliverableKey === "clicks"
              ? day.clicks
              : day.conversions
        return {
          date,
          spend: day.spend,
          impressions: day.impressions,
          clicks: day.clicks,
          conversions: day.conversions,
          deliverable_value,
        }
      })

      const asAtDate = window.endDate
        ? toISO(new Date(Math.min(today.getTime(), window.endDate.getTime())))
        : todayISO

      const deliveredTotals = actualsDaily.reduce(
        (acc, day) => {
          if (asAtDate && day.date > asAtDate) return acc
          return {
            spend: acc.spend + day.spend,
            deliverables: acc.deliverables + day.deliverable_value,
          }
        },
        { spend: 0, deliverables: 0 }
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
        pacingPct: Number((shouldDeliverables > 0 ? (deliveredTotals.deliverables / shouldDeliverables) * 100 : 0).toFixed(2)),
        goalTotal: Number(booked.deliverables.toFixed(2)),
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
      }
    })
  }

  const displayMetrics = useMemo(
    () => buildLineItemMetrics(normalizedDisplay, displayRows, displayDateSeries, displayQueryRange.start, displayQueryRange.end),
    [normalizedDisplay, displayRows, displayDateSeries, displayQueryRange.start, displayQueryRange.end]
  )
  const videoMetrics = useMemo(
    () => buildLineItemMetrics(normalizedVideo, videoRows, videoDateSeries, videoQueryRange.start, videoQueryRange.end),
    [normalizedVideo, videoRows, videoDateSeries, videoQueryRange.start, videoQueryRange.end]
  )

  const aggregateAsAtDate = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = resolvedCampaignEnd ?? displayQueryRange.end ?? videoQueryRange.end
    if (endDate) {
      const clamped = new Date(Math.min(today.getTime(), new Date(endDate).getTime()))
      return clamped.toISOString().slice(0, 10)
    }
    return today.toISOString().slice(0, 10)
  }, [resolvedCampaignEnd, displayQueryRange.end, videoQueryRange.end])

  const aggregateDisplay = useMemo(
    () => buildAggregatedMetrics(displayMetrics, aggregateAsAtDate),
    [displayMetrics, aggregateAsAtDate]
  )
  const aggregateVideo = useMemo(
    () => buildAggregatedMetrics(videoMetrics, aggregateAsAtDate),
    [videoMetrics, aggregateAsAtDate]
  )

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

  const aggregateChartRef = useRef<HTMLDivElement | null>(null)
  const lineChartRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
      backgroundColor: "#ffffff",
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
    const aggregate = isDisplay ? aggregateDisplay : aggregateVideo

    const base = `${kind === "display" ? "prog-display" : "prog-video"}-${sanitizeFilename(clientSlug)}-${sanitizeFilename(mbaNumber)}`
    const targets: Array<{ el: HTMLElement | null; name: string }> = [
      { el: aggregateChartRef.current, name: `${base}-aggregate-chart` },
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

  function renderPanel(kind: PanelKind) {
    const isDisplay = kind === "display"
    const metrics = isDisplay ? displayMetrics : videoMetrics
    const aggregate = isDisplay ? aggregateDisplay : aggregateVideo
    const bookedTotals = isDisplay ? displayBookedTotals : videoBookedTotals
    const isLoading = isDisplay ? isDisplayLoading : isVideoLoading
    const error = isDisplay ? displayError : videoError
    const label = isDisplay ? "Prog Display" : "Prog Video"

    if (!metrics.length) {
      return null
    }

    return (
      <Card className="rounded-3xl border-muted/70 bg-background/90 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{label} Performance</CardTitle>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                {clientSlug} • {mbaNumber}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportCSVs(kind)}>
                Export CSVs
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportCharts(kind)}>
                Export charts (PNG)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="h-32 animate-pulse rounded-2xl bg-muted" />
              <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallProgressCard
                label="Budget pacing"
                value={formatCurrency(aggregate.spend.actualToDate)}
                helper={`Delivered ${formatCurrency(aggregate.spend.actualToDate)} • Planned ${formatCurrency(bookedTotals.spend)}`}
                pacingPct={aggregate.spend.pacingPct}
                progressRatio={
                  bookedTotals.spend > 0
                    ? Math.max(0, Math.min(1, aggregate.spend.actualToDate / bookedTotals.spend))
                    : 0
                }
                accentColor={palette.budget}
              />
              <SmallProgressCard
                label="Deliverable pacing"
                value={formatWholeNumber(aggregate.deliverable?.actualToDate)}
                helper={`Delivered ${formatWholeNumber(aggregate.deliverable?.actualToDate)} • Planned ${formatWholeNumber(bookedTotals.deliverables)}`}
                pacingPct={aggregate.deliverable?.pacingPct}
                progressRatio={
                  bookedTotals.deliverables > 0
                    ? Math.max(
                        0,
                        Math.min(
                          1,
                          (aggregate.deliverable?.actualToDate ?? 0) / bookedTotals.deliverables
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
                totals={summarizeActuals(metrics.flatMap((metric) => metric.actualsDaily))}
              />
              <ActualsDailyDeliveryChart
                series={aggregate.series}
                asAtDate={aggregate.asAtDate}
                deliverableLabel="Deliverables"
                chartRef={aggregateChartRef}
              />
            </div>
          ) : (
            <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
          )}

          <Accordion type="multiple" defaultValue={[]}>
            {metrics.map((metric) => (
              <AccordionItem key={metric.lineItem.line_item_id} value={String(metric.lineItem.line_item_id)}>
                <AccordionTrigger className="rounded-xl px-3 py-2 text-left text-sm font-semibold">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex flex-col text-left">
                      <span>{metric.lineItem.line_item_name || metric.lineItem.line_item_id || "Line item"}</span>
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
                                (metric.pacing.deliverable?.actualToDate ?? 0) / metric.booked.deliverables
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

  if (!normalizedDisplay.length && !normalizedVideo.length) {
    return null
  }

  return (
    <div className="space-y-5">
      {renderPanel("display")}
      {renderPanel("video")}
      {DEBUG_PACING ? (
        <div className="rounded-2xl border border-dashed border-muted/70 bg-background/80 p-3 text-sm text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">Pacing debug</div>
          <div>Display line items: {normalizedDisplay.length}</div>
          <div>Video line items: {normalizedVideo.length}</div>
          <div className="mt-1">
            <span className="font-medium text-foreground">Rows</span>: display {displayRows.length} • video {videoRows.length}
          </div>
        </div>
      ) : null}
    </div>
  )
}
