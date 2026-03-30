"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@/components/AuthWrapper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Area, Brush, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import {
  UnifiedTooltip,
  normalizeRechartsTooltipPayload,
  type UnifiedTooltipRechartsPayloadEntry,
  useUnifiedTooltip,
} from "@/components/charts/UnifiedTooltip"
import { clampProgress, SmallProgressCard } from "@/components/dashboard/pacing/SmallProgressCard"
import { KPISummaryRow } from "@/components/dashboard/KPISummaryRow"
import { PacingStatusBadge } from "@/components/dashboard/PacingStatusBadge"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getDeterministicColor, getMediaColor } from "@/lib/charts/registry"
import { pacingDeviationBorderClass, pacingDeviationSparklineClass } from "@/lib/pacing/pacingDeviationStyle"
import { Copy, Expand, FileSpreadsheet, ImageDown, RefreshCw, Triangle } from "lucide-react"
import { Sparkline } from "@/components/charts/Sparkline"
import { cn } from "@/lib/utils"

const searchSeriesPalette = {
  cost: getMediaColor("search"),
  clicks: getDeterministicColor("pacing_search_clicks"),
  revenue: getDeterministicColor("pacing_search_revenue"),
  conversions: getDeterministicColor("pacing_search_conversions"),
} as const

type SearchPacingContainerProps = {
  clientSlug: string
  mbaNumber: string
  lineItemIds: string[]
  searchLineItems?: any[]
  campaignPlannedEndDate?: string
  startDate: string
  endDate: string
  initialSearchData?: ApiResponse | null
  brandColour?: string
}

type ApiTotals = {
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

type ApiDailyRow = {
  date: string
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

type ApiResponse = {
  totals: ApiTotals
  daily: ApiDailyRow[]
  lineItems?: Array<{
    lineItemId: string
    lineItemName: string | null
    totals: ApiTotals
    daily: ApiDailyRow[]
  }>
}

const IS_DEV = process.env.NODE_ENV !== "production"
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

function parseAmountSafe(value: any): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  return n / d
}

function parseISODateOnlyOrNull(value: any): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function daysInclusive(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1)
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function buildDateListISO(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO || endISO < startISO) return []
  const days = daysInclusive(startISO, endISO)
  if (days <= 0) return []
  const out: string[] = []
  for (let i = 0; i < days; i++) out.push(addDaysISO(startISO, i))
  return out
}

function fillDailySeries(daily: ApiDailyRow[], startISO: string, endISO: string): ApiDailyRow[] {
  const list = buildDateListISO(startISO, endISO)
  if (!list.length) return Array.isArray(daily) ? daily : []
  const map = new Map<string, ApiDailyRow>()
  ;(Array.isArray(daily) ? daily : []).forEach((row) => {
    const key = String(row?.date ?? "").slice(0, 10)
    if (key) map.set(key, row)
  })
  return list.map((date) => {
    const existing = map.get(date)
    if (existing) {
      return {
        date,
        cost: Number(existing.cost ?? 0),
        clicks: Number(existing.clicks ?? 0),
        conversions: Number(existing.conversions ?? 0),
        revenue: Number(existing.revenue ?? 0),
        impressions: Number(existing.impressions ?? 0),
        topImpressionPct: existing.topImpressionPct ?? null,
      }
    }
    return {
      date,
      cost: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      topImpressionPct: null,
    }
  })
}

type NormalizedBurst = {
  startISO: string
  endISO: string
  budget: number
  clicksGoal: number
}

function parseBursts(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).bursts)) {
    return (raw as any).bursts
  }
  return []
}

function normalizeBursts(raw: unknown, opts?: { includeClicksGoal?: boolean }): NormalizedBurst[] {
  const includeClicksGoal = opts?.includeClicksGoal === true
  const bursts = parseBursts(raw)
  return bursts
    .map((b) => {
      const startISO = parseISODateOnlyOrNull((b as any)?.start_date ?? (b as any)?.startDate)
      const endISO = parseISODateOnlyOrNull((b as any)?.end_date ?? (b as any)?.endDate)
      if (!startISO || !endISO) return null

      const budget = parseAmountSafe(
        (b as any)?.media_investment ??
          (b as any)?.budget_number ??
          (b as any)?.spend ??
          (b as any)?.amount ??
          (b as any)?.budget
      )
      const buyAmount = includeClicksGoal
        ? parseAmountSafe(
            (b as any)?.buy_amount ??
              (b as any)?.buyAmount ??
              (b as any)?.buy_amount_number ??
              (b as any)?.buyAmountNumber
          )
        : 0

      // Search Xano bursts_json commonly uses { budget, buyAmount, startDate, endDate, calculatedValue }.
      // For CPC search line items, "calculatedValue" represents planned clicks (deliverables).
      let clicksGoal = includeClicksGoal
        ? parseAmountSafe(
            (b as any)?.deliverables ??
              (b as any)?.calculated_value_number ??
              (b as any)?.calculatedValue ??
              (b as any)?.calculated_value ??
              (b as any)?.clicks ??
              (b as any)?.deliverable_value
          )
        : 0

      // If deliverables weren't provided, infer clicks from budget and buy amount (e.g. $/click).
      if (includeClicksGoal && clicksGoal === 0 && budget > 0 && buyAmount > 0) {
        clicksGoal = budget / buyAmount
      }

      return { startISO, endISO, budget, clicksGoal } satisfies NormalizedBurst
    })
    .filter((v): v is NormalizedBurst => Boolean(v))
}

function computeToDateFromBursts(
  bursts: NormalizedBurst[],
  asAtISO: string,
  field: "budget" | "clicksGoal"
): { bookedTotal: number; expectedToDate: number } {
  const asAt = new Date(`${asAtISO}T00:00:00Z`)
  if (Number.isNaN(asAt.getTime())) return { bookedTotal: 0, expectedToDate: 0 }

  let bookedTotal = 0
  let expectedToDate = 0

  for (const burst of bursts) {
    const total = field === "budget" ? burst.budget : burst.clicksGoal
    bookedTotal += total

    const burstStart = new Date(`${burst.startISO}T00:00:00Z`)
    const burstEnd = new Date(`${burst.endISO}T00:00:00Z`)
    if (Number.isNaN(burstStart.getTime()) || Number.isNaN(burstEnd.getTime())) continue

    if (asAt < burstStart) continue

    const windowEnd = asAt > burstEnd ? burst.endISO : asAtISO
    const totalDays = daysInclusive(burst.startISO, burst.endISO)
    const elapsedDays = daysInclusive(burst.startISO, windowEnd)
    if (totalDays <= 0 || elapsedDays <= 0) continue

    expectedToDate += total * Math.min(1, Math.max(0, elapsedDays / totalDays))
  }

  return { bookedTotal, expectedToDate }
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))
}

function formatNumber(value: number | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n.toLocaleString("en-AU") : "0"
}

function formatDateAU(dateString: string | undefined) {
  if (!dateString) return "—"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return String(dateString)
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(d)
}

function formatCompactNumber(value: number | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat("en-AU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

function formatChartDateLabel(iso: string | undefined) {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" }).format(d)
}

function formatPercentAuto(value: number | null | undefined, digits: number = 2) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(digits)}%`
}

function formatRatio(value: number | null | undefined, digits: number = 2) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toFixed(digits)
}

function buildDailyTableRows(daily: ApiDailyRow[]) {
  return daily.map((d) => {
    const cost = Number(d.cost ?? 0)
    const impressions = Number(d.impressions ?? 0)
    const clicks = Number(d.clicks ?? 0)
    const conversions = Number(d.conversions ?? 0)
    const revenue = Number(d.revenue ?? 0)

    const ctr = safeDiv(clicks, impressions)
    const cpm = safeDiv(cost * 1000, impressions)
    const cpc = safeDiv(cost, clicks)
    const cpa = safeDiv(cost, conversions)
    const roas = safeDiv(revenue, cost)

    return {
      date: d.date,
      cost,
      impressions,
      clicks,
      conversions,
      revenue,
      topImpressionPct: d.topImpressionPct ?? null,
      ctr,
      cpm,
      cpc,
      cpa,
      roas,
    }
  })
}

type DeliveryTableRow = ReturnType<typeof buildDailyTableRows>[number]

function summarizeDeliveryTable(rows: DeliveryTableRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.cost += row.cost
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      acc.conversions += row.conversions
      acc.revenue += row.revenue
      if (row.topImpressionPct !== null && row.impressions > 0) {
        acc._topWeighted += row.topImpressionPct * row.impressions
        acc._topWeight += row.impressions
      }
      return acc
    },
    {
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      _topWeighted: 0,
      _topWeight: 0,
    }
  )

  const ctr = safeDiv(totals.clicks, totals.impressions)
  const cpm = safeDiv(totals.cost * 1000, totals.impressions)
  const cpc = safeDiv(totals.cost, totals.clicks)
  const cpa = safeDiv(totals.cost, totals.conversions)
  const roas = safeDiv(totals.revenue, totals.cost)
  const topImpressionPct = totals._topWeight > 0 ? totals._topWeighted / totals._topWeight : null

  return { ...totals, ctr, cpm, cpc, cpa, roas, topImpressionPct }
}

function DeliveryTable({ rows }: { rows: DeliveryTableRow[] }) {
  const { exportCsv } = useChartExport()
  const COLS =
    "130px 120px 130px 110px 90px 110px 110px 120px 110px 120px 120px 150px"
  const totals = summarizeDeliveryTable(rows)
  const [sortKey, setSortKey] = useState<keyof DeliveryTableRow>("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (sortKey === "date") {
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      }
      const an = Number(av ?? 0)
      const bn = Number(bv ?? 0)
      return sortDir === "asc" ? an - bn : bn - an
    })
    return copy
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: keyof DeliveryTableRow) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir("desc")
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center justify-end border-b bg-muted/20 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            exportCsv(
              sortedRows,
              [
                { header: "Date", accessor: (r: DeliveryTableRow) => r.date },
                { header: "Cost", accessor: (r: DeliveryTableRow) => r.cost },
                { header: "Impressions", accessor: (r: DeliveryTableRow) => r.impressions },
                { header: "Clicks", accessor: (r: DeliveryTableRow) => r.clicks },
                { header: "CTR", accessor: (r: DeliveryTableRow) => r.ctr },
                { header: "CPM", accessor: (r: DeliveryTableRow) => r.cpm },
                { header: "CPC", accessor: (r: DeliveryTableRow) => r.cpc },
                { header: "Conversions", accessor: (r: DeliveryTableRow) => r.conversions },
                { header: "CPA", accessor: (r: DeliveryTableRow) => r.cpa },
                { header: "Revenue", accessor: (r: DeliveryTableRow) => r.revenue },
                { header: "ROAS", accessor: (r: DeliveryTableRow) => r.roas },
                { header: "Top Impression %", accessor: (r: DeliveryTableRow) => r.topImpressionPct },
              ],
              "search-delivery-table.csv",
            )
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export table
        </Button>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <div className="sticky top-0 z-10 bg-muted/70 backdrop-blur border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
            {(
              [
                ["date", "Date"],
                ["cost", "Cost"],
                ["impressions", "Impressions"],
                ["clicks", "Clicks"],
                ["ctr", "CTR"],
                ["cpm", "CPM"],
                ["cpc", "CPC"],
                ["conversions", "Conversions"],
                ["cpa", "CPA"],
                ["revenue", "Revenue"],
                ["roas", "ROAS"],
                ["topImpressionPct", "Top Impression %"],
              ] as Array<[keyof DeliveryTableRow, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn("text-left transition-colors hover:text-foreground", key !== "date" && "text-right")}
                onClick={() => toggleSort(key)}
              >
                {label}
                {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </button>
            ))}
          </div>
        </div>

        {sortedRows.map((row, ri) => (
          <div
            key={row.date}
            className={cn(
              "campaign-section-enter grid items-center gap-3 border-b px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-muted/30",
              ri % 2 === 1 ? "bg-muted/15" : "bg-background"
            )}
            style={{ gridTemplateColumns: COLS, animationDelay: `${ri * 40}ms` }}
          >
            <div className="font-medium" title={row.date}>
              {formatDateAU(row.date)}
            </div>
            <div className="text-right">{formatCurrency(row.cost)}</div>
            <div className="text-right">{formatNumber(row.impressions)}</div>
            <div className="text-right">{formatNumber(row.clicks)}</div>
            <div className="text-right">{formatPercentAuto(row.ctr, 2)}</div>
            <div className="text-right">{row.cpm === null ? "—" : formatCurrency(row.cpm)}</div>
            <div className="text-right">{row.cpc === null ? "—" : formatCurrency(row.cpc)}</div>
            <div className="text-right">{formatNumber(row.conversions)}</div>
            <div className="text-right">{row.cpa === null ? "—" : formatCurrency(row.cpa)}</div>
            <div className="text-right">{formatCurrency(row.revenue)}</div>
            <div className="text-right">{formatRatio(row.roas, 2)}</div>
            <div className="text-right">{formatPercentAuto(row.topImpressionPct, 2)}</div>
          </div>
        ))}

        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t px-3 py-2 text-sm font-semibold">
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
            <div>Totals</div>
            <div className="text-right">{formatCurrency(totals.cost)}</div>
            <div className="text-right">{formatNumber(totals.impressions)}</div>
            <div className="text-right">{formatNumber(totals.clicks)}</div>
            <div className="text-right">{formatPercentAuto(totals.ctr, 2)}</div>
            <div className="text-right">{totals.cpm === null ? "—" : formatCurrency(totals.cpm)}</div>
            <div className="text-right">{totals.cpc === null ? "—" : formatCurrency(totals.cpc)}</div>
            <div className="text-right">{formatNumber(totals.conversions)}</div>
            <div className="text-right">{totals.cpa === null ? "—" : formatCurrency(totals.cpa)}</div>
            <div className="text-right">{formatCurrency(totals.revenue)}</div>
            <div className="text-right">{formatRatio(totals.roas, 2)}</div>
            <div className="text-right">{formatPercentAuto(totals.topImpressionPct, 2)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Safe JSON parser with content-type check (copied pattern from other pacing containers)
async function parseJsonSafely(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    const text = await response.text()
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.slice(0, 200)}`)
  }
  return response.json()
}

export default function SearchPacingContainer({
  clientSlug,
  mbaNumber,
  lineItemIds,
  searchLineItems,
  campaignPlannedEndDate,
  startDate,
  endDate,
  initialSearchData,
  brandColour,
}: SearchPacingContainerProps): React.ReactElement | null {
  const searchCostAccent = brandColour ?? searchSeriesPalette.cost
  const { user, isLoading: authLoading } = useUser()
  const { exportCsv, exportPng, isExporting } = useChartExport()
  const { toast } = useToast()

  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [showClicksSpendSeries, setShowClicksSpendSeries] = useState({ cost: true, clicks: true })
  const [showConvRevenueSeries, setShowConvRevenueSeries] = useState({ revenue: true, conversions: true })

  const pendingFetchKeyRef = useRef<string | null>(null)
  const lastSuccessfulFetchKeyRef = useRef<string | null>(null)
  const requestSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)
  const clicksSpendChartRef = useRef<HTMLDivElement | null>(null)
  const convRevenueChartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      unmountedRef.current = true
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const normalizedLineItemIds = useMemo(() => {
    const ids = Array.isArray(lineItemIds) ? lineItemIds : []
    return Array.from(
      new Set(
        ids
          .map((id) => String(id ?? "").trim().toLowerCase())
          .filter((id) => Boolean(id) && id !== "undefined" && id !== "null")
      )
    ).sort()
  }, [lineItemIds])

  const fetchKey = useMemo(
    () => `${normalizedLineItemIds.join(",")}|${startDate}|${endDate}`,
    [normalizedLineItemIds, startDate, endDate]
  )

  const userIdentityKey = user?.sub ?? user?.email ?? null

  const fetchSearchPacing = useCallback(async (retryAttempt = 0) => {
    const requestId = (requestSeqRef.current += 1)
    // Abort any previous in-flight request for this component instance.
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setIsLoading(true)
    setError(null)
    let scheduledRetry = false

    if (IS_DEV || DEBUG_PACING) {
      console.log("[PACING UI] calling /api/pacing/bulk (includeSearch)", {
        fetchKey,
        retryAttempt,
        mbaNumber,
        lineItemIdsCount: normalizedLineItemIds.length,
        startDate,
        endDate,
      })
    }

    try {
      const response = await fetch("/api/pacing/bulk", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mbaNumber,
          // Search pacing is requested as an optional payload of the bulk pacing endpoint.
          // We intentionally omit bulk lineItemIds to avoid redundant work when only Search is needed.
          lineItemIds: [],
          includeSearch: true,
          searchLineItemIds: normalizedLineItemIds,
          searchStartDate: startDate,
          searchEndDate: endDate,
        }),
        signal: ac.signal,
      })

      // Match existing pacing retry behavior on auth-ish responses.
      if (response.status === 401 || response.status === 403 || response.status === 302) {
        if (retryAttempt === 0) {
          scheduledRetry = true
          setTimeout(() => {
            if (!unmountedRef.current && requestId === requestSeqRef.current) {
              fetchSearchPacing(1)
            }
          }, 400)
          return
        }
        const errorText = await response.text().catch(() => "Authentication failed")
        throw new Error(`Authentication failed (${response.status}): ${errorText.slice(0, 200)}`)
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Request failed")
        throw new Error(`Search pacing request failed (${response.status}): ${errorText.slice(0, 200)}`)
      }

      const bulkJson = await parseJsonSafely(response)
      const json = ((bulkJson as any)?.search ?? null) as ApiResponse | null
      if (!json) {
        throw new Error("Bulk pacing response did not include search payload")
      }
      if (unmountedRef.current || requestId !== requestSeqRef.current) return

      // Match Social pacing behavior: a 200 may still contain { error }.
      const apiError = (json as any)?.error
      if (apiError) {
        const message = String(apiError)
        if (!unmountedRef.current && requestId === requestSeqRef.current) {
          pendingFetchKeyRef.current = null
          setError(message)
          // Still keep any payload for debugging/partial rendering, but do NOT commit the key as "successful".
          setData(json)
        }
        if (IS_DEV || DEBUG_PACING) {
          console.log("[PACING UI] bulk search payload returned error field", {
            fetchKey,
            retryAttempt,
            error: message,
            hasDaily: Array.isArray((json as any)?.daily) ? (json as any).daily.length : 0,
            hasLineItems: Array.isArray((json as any)?.lineItems) ? (json as any).lineItems.length : 0,
          })
        }
        return
      }

      // Successful: no error field.
      if (!unmountedRef.current && requestId === requestSeqRef.current) {
        lastSuccessfulFetchKeyRef.current = fetchKey
        pendingFetchKeyRef.current = null
        setData(json)
        setError(null)
        setLastSyncedAt(new Date())
      }
    } catch (err) {
      // Ignore aborts (effect cleanup / superseded request).
      const isAbort = Boolean(err && typeof err === "object" && (err as any).name === "AbortError")
      if (isAbort) return
      if (unmountedRef.current || requestId !== requestSeqRef.current) return

      pendingFetchKeyRef.current = null
      const message = err instanceof Error ? err.message : String(err)

      // Retry once if we got HTML/non-JSON (often auth redirect)
      if (message.includes("Expected JSON but got") && retryAttempt === 0) {
        scheduledRetry = true
        setTimeout(() => {
          if (!unmountedRef.current && requestId === requestSeqRef.current) {
            fetchSearchPacing(1)
          }
        }, 400)
        return
      }

      setError(message)
    } finally {
      // Only finalize for the latest request, and never after unmount.
      if (unmountedRef.current) return
      if (requestId !== requestSeqRef.current) return
      if (!scheduledRetry) {
        // If we're retrying, keep the pending key in place to dedupe the effect.
        // Otherwise clear it so subsequent renders can refetch.
        if (pendingFetchKeyRef.current === fetchKey) pendingFetchKeyRef.current = null
      }
      setIsLoading(false)
    }
  }, [fetchKey, mbaNumber, normalizedLineItemIds, startDate, endDate])

  useEffect(() => {
    // Mirror Social/Programmatic behavior: when initial data is provided by a shared bulk fetch,
    // don't auto-fetch inside the container.
    if (initialSearchData !== undefined) {
      setData(initialSearchData)
      setIsLoading(false)
      setError((initialSearchData as any)?.error ? String((initialSearchData as any).error) : null)
      return
    }
  }, [initialSearchData])

  useEffect(() => {
    // Guard: Skip auto-fetch if initialSearchData is provided (from PacingDataProviderWrapper)
    if (initialSearchData !== undefined) return

    // Guard: wait for auth and user
    if (authLoading) return
    if (!user) return
    if (!startDate || !endDate) return
    if (normalizedLineItemIds.length === 0) return

    if (pendingFetchKeyRef.current === fetchKey) return
    if (lastSuccessfulFetchKeyRef.current === fetchKey) return

    pendingFetchKeyRef.current = fetchKey
    fetchSearchPacing(0)

    return () => {
      // Abort in-flight fetch so we don't deadlock the pending key on rapid rerenders.
      abortRef.current?.abort()
      abortRef.current = null
      if (pendingFetchKeyRef.current === fetchKey) pendingFetchKeyRef.current = null
    }
  }, [
    authLoading,
    user,
    userIdentityKey,
    fetchSearchPacing,
    initialSearchData,
    fetchKey,
    startDate,
    endDate,
    normalizedLineItemIds.length,
  ])

  const totals = useMemo(
    () =>
      data?.totals ?? {
        cost: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        impressions: 0,
        topImpressionPct: null,
      },
    [data],
  )

  const windowStartISO = parseISODateOnlyOrNull(startDate) ?? startDate
  const windowEndISO = parseISODateOnlyOrNull(endDate) ?? endDate

  const rawDaily = useMemo(() => (Array.isArray(data?.daily) ? data!.daily : []), [data])
  const daily = useMemo(() => fillDailySeries(rawDaily, windowStartISO, windowEndISO), [rawDaily, windowStartISO, windowEndISO])

  const hasAnyData =
    rawDaily.length > 0 ||
    Boolean(
      (data?.totals?.cost ?? 0) ||
        (data?.totals?.clicks ?? 0) ||
        (data?.totals?.conversions ?? 0) ||
        (data?.totals?.impressions ?? 0) ||
        (data?.totals?.revenue ?? 0)
    )

  const lineItemSeries = Array.isArray(data?.lineItems)
    ? data!.lineItems!.map((li) => ({
        ...li,
        daily: fillDailySeries(Array.isArray(li?.daily) ? li.daily : [], windowStartISO, windowEndISO),
      }))
    : []

  const asAtISO = parseISODateOnlyOrNull(endDate) ?? endDate

  const scheduleByLineItemId = useMemo(() => {
    const items = Array.isArray(searchLineItems) ? searchLineItems : []
    const map = new Map<string, { buyType: string; bursts: NormalizedBurst[] }>()
    items.forEach((item) => {
      const id = String(item?.line_item_id ?? item?.lineItemId ?? item?.LINE_ITEM_ID ?? "").trim().toLowerCase()
      if (!id) return
      const buyType = String(item?.buy_type ?? item?.buyType ?? "").trim().toLowerCase()
      // For Search pacing, planned "deliverables" (stored in bursts_json) are most reliable for CPC (clicks)
      // and bonus line items where deliverables may be explicitly entered.
      const includeClicksGoal = buyType === "cpc" || buyType === "bonus" || buyType.includes("cpc")

      const burstsPrimary = normalizeBursts(
        item?.bursts ?? item?.bursts_json ?? item?.burstsJson ?? item?.bursts_json,
        { includeClicksGoal }
      )
      const burstsFallback = burstsPrimary.length
        ? burstsPrimary
        : normalizeBursts(item?.bursts_json, { includeClicksGoal })

      map.set(id, { buyType, bursts: burstsFallback })
    })
    return map
  }, [searchLineItems])

  const totalSchedule = useMemo(() => {
    const ids = Array.from(scheduleByLineItemId.keys())
    let budgetBooked = 0
    let budgetExpected = 0
    let clicksBooked = 0
    let clicksExpected = 0

    ids.forEach((id) => {
      const bursts = scheduleByLineItemId.get(id)?.bursts ?? []
      const spend = computeToDateFromBursts(bursts, asAtISO, "budget")
      const clicks = computeToDateFromBursts(bursts, asAtISO, "clicksGoal")
      budgetBooked += spend.bookedTotal
      budgetExpected += spend.expectedToDate
      clicksBooked += clicks.bookedTotal
      clicksExpected += clicks.expectedToDate
    })

    return { budgetBooked, budgetExpected, clicksBooked, clicksExpected }
  }, [scheduleByLineItemId, asAtISO])

  const totalsKpis = useMemo(() => {
    const ctr = safeDiv(totals.clicks, totals.impressions) // fraction
    const cvr = safeDiv(totals.conversions, totals.clicks) // fraction
    const cpc = safeDiv(totals.cost, totals.clicks)
    const topShare = totals.topImpressionPct
    return { ctr, cvr, cpc, topShare }
  }, [totals.clicks, totals.impressions, totals.conversions, totals.cost, totals.topImpressionPct])

  const totalDerived = useMemo(() => {
    const spendExpected = totalSchedule.budgetExpected
    const clicksExpected = totalSchedule.clicksExpected

    const budgetPacingPct = spendExpected > 0 ? (totals.cost / spendExpected) * 100 : undefined
    const clicksPacingPct = clicksExpected > 0 ? (totals.clicks / clicksExpected) * 100 : undefined

    const expectedCpc = safeDiv(spendExpected, clicksExpected)
    const actualCpc = safeDiv(totals.cost, totals.clicks)
    const cpcPacingPct =
      expectedCpc !== null && actualCpc !== null && actualCpc > 0 ? (expectedCpc / actualCpc) * 100 : undefined

    const expectedConversions =
      clicksExpected > 0 && totalsKpis.cvr !== null ? clicksExpected * totalsKpis.cvr : null
    const conversionsPacingPct =
      expectedConversions !== null && expectedConversions > 0 ? (totals.conversions / expectedConversions) * 100 : undefined

    const expectedImpressions =
      clicksExpected > 0 && totalsKpis.ctr !== null && totalsKpis.ctr > 0 ? clicksExpected / totalsKpis.ctr : null
    const impressionsPacingPct =
      expectedImpressions !== null && expectedImpressions > 0 ? (totals.impressions / expectedImpressions) * 100 : undefined

    const TOP_SHARE_TARGET = 0.5
    const topSharePct = totals.topImpressionPct ?? null
    const topSharePacingPct =
      topSharePct !== null && TOP_SHARE_TARGET > 0 ? (topSharePct / TOP_SHARE_TARGET) * 100 : undefined

    return {
      budgetPacingPct,
      clicksPacingPct,
      expectedCpc,
      actualCpc,
      cpcPacingPct,
      expectedConversions,
      conversionsPacingPct,
      expectedImpressions,
      impressionsPacingPct,
      topSharePacingPct,
    }
  }, [totalSchedule, totals, totalsKpis])

  const chartClicksSpend = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date,
        clicks: Number(d.clicks ?? 0),
        cost: Number(d.cost ?? 0),
      })),
    [daily]
  )

  const chartConvRevenue = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date,
        conversions: Number(d.conversions ?? 0),
        revenue: Number(d.revenue ?? 0),
      })),
    [daily]
  )
  const clicksSpendIndexByDate = useMemo(() => {
    const m = new Map<string, number>()
    chartClicksSpend.forEach((row, i) => m.set(row.date, i))
    return m
  }, [chartClicksSpend])
  const convRevenueIndexByDate = useMemo(() => {
    const m = new Map<string, number>()
    chartConvRevenue.forEach((row, i) => m.set(row.date, i))
    return m
  }, [chartConvRevenue])

  const renderClicksSpendTooltip = useUnifiedTooltip(
    useMemo(
      () => ({
        formatValue: (v: number) => formatCompactNumber(v),
        showPercentages: false,
        formatLabel: (l: string) => formatChartDateLabel(l),
        getComparison: (labelStr: string) => {
          const idx = clicksSpendIndexByDate.get(labelStr)
          const prev = typeof idx === "number" && idx > 0 ? chartClicksSpend[idx - 1] : undefined
          if (!prev) return undefined
          const prevTotal = Number(prev.cost ?? 0) + Number(prev.clicks ?? 0)
          return { value: prevTotal, label: "vs previous day" }
        },
      }),
      [clicksSpendIndexByDate, chartClicksSpend],
    ),
  )

  const renderConvRevenueTooltip = useUnifiedTooltip(
    useMemo(
      () => ({
        formatValue: (v: number) => formatCompactNumber(v),
        showPercentages: false,
        formatLabel: (l: string) => formatChartDateLabel(l),
        getComparison: (labelStr: string) => {
          const idx = convRevenueIndexByDate.get(labelStr)
          const prev = typeof idx === "number" && idx > 0 ? chartConvRevenue[idx - 1] : undefined
          if (!prev) return undefined
          const prevTotal = Number(prev.revenue ?? 0) + Number(prev.conversions ?? 0)
          return { value: prevTotal, label: "vs previous day" }
        },
      }),
      [convRevenueIndexByDate, chartConvRevenue],
    ),
  )

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const showTodayOnClicksSpend = useMemo(
    () => chartClicksSpend.some((d) => d.date === todayIso),
    [chartClicksSpend, todayIso],
  )
  const showTodayOnConvRevenue = useMemo(
    () => chartConvRevenue.some((d) => d.date === todayIso),
    [chartConvRevenue, todayIso],
  )
  const syncTimestampLabel = lastSyncedAt
    ? new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(lastSyncedAt)
    : "Never"

  const handleExportCsvs = () => {
    exportCsv(
      chartClicksSpend,
      [
        { header: "Date", accessor: (row: (typeof chartClicksSpend)[number]) => row.date },
        { header: "Cost", accessor: (row: (typeof chartClicksSpend)[number]) => row.cost },
        { header: "Clicks", accessor: (row: (typeof chartClicksSpend)[number]) => row.clicks },
      ],
      `search-${clientSlug}-${mbaNumber}-clicks-spend.csv`,
    )
    exportCsv(
      chartConvRevenue,
      [
        { header: "Date", accessor: (row: (typeof chartConvRevenue)[number]) => row.date },
        { header: "Revenue", accessor: (row: (typeof chartConvRevenue)[number]) => row.revenue },
        { header: "Conversions", accessor: (row: (typeof chartConvRevenue)[number]) => row.conversions },
      ],
      `search-${clientSlug}-${mbaNumber}-conversions-revenue.csv`,
    )
    toast({ title: "CSV exported", description: "Search chart data has been downloaded." })
  }

  const handleExportPngs = async () => {
    if (clicksSpendChartRef.current) {
      await exportPng(clicksSpendChartRef, `search-${clientSlug}-${mbaNumber}-clicks-spend.png`)
    }
    if (convRevenueChartRef.current) {
      await exportPng(convRevenueChartRef, `search-${clientSlug}-${mbaNumber}-conversions-revenue.png`)
    }
    toast({ title: "PNG exported", description: "Search charts have been downloaded." })
  }
  const handleSyncNow = () => {
    pendingFetchKeyRef.current = null
    fetchSearchPacing(0)
  }

  const dailyTableRows = useMemo(() => buildDailyTableRows(daily), [daily])

  const secondaryMetrics = [
    {
      label: "CPC",
      value: totalDerived.actualCpc === null ? "—" : totalDerived.actualCpc,
      expected: totalDerived.expectedCpc === null ? undefined : totalDerived.expectedCpc,
      pacingPct: typeof totalDerived.cpcPacingPct === "number" ? totalDerived.cpcPacingPct : undefined,
      accentColor: searchSeriesPalette.clicks,
      format: "currency" as const,
      hint: "Cost per click versus expected CPC from planned pace.",
    },
    {
      label: "Conversions",
      value: totals.conversions,
      expected: totalDerived.expectedConversions === null ? undefined : totalDerived.expectedConversions,
      pacingPct: typeof totalDerived.conversionsPacingPct === "number" ? totalDerived.conversionsPacingPct : undefined,
      accentColor: searchSeriesPalette.conversions,
      format: "number" as const,
      hint: "Delivered conversions compared with expected to-date conversions.",
    },
    {
      label: "Top Impression Share",
      value: totals.topImpressionPct ? Number(formatPercentAuto(totals.topImpressionPct, 2).replace("%", "")) : 0,
      expected: 50,
      pacingPct: typeof totalDerived.topSharePacingPct === "number" ? totalDerived.topSharePacingPct : undefined,
      accentColor: brandColour ?? searchSeriesPalette.cost,
      format: "percent" as const,
      hint: "Share of top results compared to 50% benchmark.",
    },
    {
      label: "Impressions",
      value: totals.impressions,
      expected: totalDerived.expectedImpressions === null ? undefined : totalDerived.expectedImpressions,
      pacingPct: typeof totalDerived.impressionsPacingPct === "number" ? totalDerived.impressionsPacingPct : undefined,
      accentColor: brandColour ?? searchSeriesPalette.cost,
      format: "number" as const,
      hint: "Delivered impressions compared against expected volume.",
    },
  ]

  const totalSecondaryCards = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {secondaryMetrics.map((metric) => (
          <TooltipProvider key={metric.label}>
            <UiTooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-1">
                  <Triangle className="h-3 w-3 text-muted-foreground" />
                  {metric.label}
                </span>
              </TooltipTrigger>
              <TooltipContent>{metric.hint}</TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        ))}
      </div>
      <KPISummaryRow metrics={secondaryMetrics} columns={4} embedded />
    </div>
  )

  const searchAvgCpm =
    totals.impressions > 0 ? (totals.cost / totals.impressions) * 1000 : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-foreground">Search performance</span>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
            {clientSlug} • {mbaNumber}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="shrink-0 rounded-full px-3 py-1 text-[11px]">
            {startDate} → {endDate}
          </Badge>
          <Badge variant="outline" className="shrink-0 rounded-full px-3 py-1 text-[11px]">
            Last synced {syncTimestampLabel}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync now
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsvs} disabled={isExporting}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPngs} disabled={isExporting}>
            <ImageDown className="mr-2 h-4 w-4" />
            Export PNG
          </Button>
        </div>
      </div>
        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={handleSyncNow}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
            </div>
            <div className="h-[320px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[320px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
          </>
        ) : !hasAnyData ? (
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            No Search pacing data is available for this date range yet.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total spend</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(totals.cost)}</p>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Impressions</p>
                <p className="text-sm font-semibold text-foreground">{formatNumber(totals.impressions)}</p>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Avg CPM</p>
                <p className="text-sm font-semibold text-foreground">
                  {searchAvgCpm !== null ? formatCurrency(searchAvgCpm) : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="text-sm font-semibold text-foreground">{formatNumber(totals.clicks)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SmallProgressCard
                label="Budget pacing"
                value={formatCurrency(totals.cost)}
                helper={`Delivered ${formatCurrency(totals.cost)} • Planned ${formatCurrency(totalSchedule.budgetBooked)}`}
                pacingPct={typeof totalDerived.budgetPacingPct === "number" ? totalDerived.budgetPacingPct : undefined}
                progressRatio={
                  totalSchedule.budgetBooked > 0 ? clampProgress(totals.cost / totalSchedule.budgetBooked) : 0
                }
                accentColor={searchCostAccent}
                sparklineData={daily.map((d) => Number(d.cost ?? 0))}
                comparisonValue={100}
                comparisonLabel="Expected pace"
                embedded
              />
              <SmallProgressCard
                label="Clicks pacing"
                value={formatNumber(totals.clicks)}
                helper={`Delivered ${formatNumber(totals.clicks)} • Planned ${formatNumber(totalSchedule.clicksBooked)}`}
                pacingPct={typeof totalDerived.clicksPacingPct === "number" ? totalDerived.clicksPacingPct : undefined}
                progressRatio={
                  totalSchedule.clicksBooked > 0 ? clampProgress(totals.clicks / totalSchedule.clicksBooked) : 0
                }
                accentColor={searchSeriesPalette.clicks}
                sparklineData={daily.map((d) => Number(d.clicks ?? 0))}
                comparisonValue={100}
                comparisonLabel="Expected pace"
                embedded
              />
            </div>

            {totalSecondaryCards}

            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Daily Clicks + Spend</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">{daily.length ? `${daily.length} days` : "—"}</div>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => document.documentElement.requestFullscreen?.()}>
                    <Expand className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => exportPng(clicksSpendChartRef, `search-${mbaNumber}-clicks-spend.png`)}>
                    <ImageDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(JSON.stringify(chartClicksSpend))
                      toast({ title: "Copied", description: "Chart data copied to clipboard." })
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button size="sm" variant={showClicksSpendSeries.cost ? "secondary" : "outline"} onClick={() => setShowClicksSpendSeries((s) => ({ ...s, cost: !s.cost }))}>
                  Cost
                </Button>
                <Button size="sm" variant={showClicksSpendSeries.clicks ? "secondary" : "outline"} onClick={() => setShowClicksSpendSeries((s) => ({ ...s, clicks: !s.clicks }))}>
                  Clicks
                </Button>
              </div>
              <ChartContainer
                config={{
                  cost: { label: "Cost", color: searchCostAccent },
                  clicks: { label: "Clicks", color: searchSeriesPalette.clicks },
                }}
                className="h-[320px] w-full"
                ref={clicksSpendChartRef}
              >
                <LineChart data={chartClicksSpend} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="search-cost-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={searchCostAccent} stopOpacity={0.24} />
                      <stop offset="95%" stopColor={searchCostAccent} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="search-clicks-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={searchSeriesPalette.clicks} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={searchSeriesPalette.clicks} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} stroke="hsl(var(--muted-foreground))" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                    angle={chartClicksSpend.length > 10 ? -45 : 0}
                    textAnchor={chartClicksSpend.length > 10 ? "end" : "middle"}
                    height={chartClicksSpend.length > 10 ? 56 : 30}
                    tickFormatter={(v) => formatChartDateLabel(String(v))}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatCompactNumber(Number(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatCompactNumber(Number(v))}
                  />
                  <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                  {showClicksSpendSeries.cost ? <Area type="monotone" yAxisId="left" dataKey="cost" fill="url(#search-cost-fill)" stroke="none" /> : null}
                  {showClicksSpendSeries.clicks ? <Area type="monotone" yAxisId="right" dataKey="clicks" fill="url(#search-clicks-fill)" stroke="none" /> : null}
                  {showClicksSpendSeries.cost ? <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="cost"
                    name="Cost"
                    stroke={searchCostAccent}
                    strokeWidth={2.5}
                    dot={false}
                    cursor="default"
                    activeDot={{ r: 4, stroke: searchCostAccent, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
                  /> : null}
                  {showClicksSpendSeries.clicks ? <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="clicks"
                    name="Clicks"
                    stroke={searchSeriesPalette.clicks}
                    strokeWidth={2.5}
                    dot={false}
                    cursor="default"
                    activeDot={{ r: 4, stroke: searchSeriesPalette.clicks, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
                  /> : null}
                  {showTodayOnClicksSpend ? (
                    <ReferenceLine
                      yAxisId="left"
                      x={todayIso}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 4"
                    />
                  ) : null}
                  {chartClicksSpend.length > 30 ? <Brush dataKey="date" height={20} travellerWidth={8} /> : null}
                  <Tooltip content={renderClicksSpendTooltip} />
                </LineChart>
              </ChartContainer>
            </div>

            <div className="space-y-4 rounded-2xl border border-muted/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Daily Conversions + Revenue</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">{daily.length ? `${daily.length} days` : "—"}</div>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => document.documentElement.requestFullscreen?.()}>
                    <Expand className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => exportPng(convRevenueChartRef, `search-${mbaNumber}-conv-revenue.png`)}>
                    <ImageDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button size="sm" variant={showConvRevenueSeries.revenue ? "secondary" : "outline"} onClick={() => setShowConvRevenueSeries((s) => ({ ...s, revenue: !s.revenue }))}>
                  Revenue
                </Button>
                <Button size="sm" variant={showConvRevenueSeries.conversions ? "secondary" : "outline"} onClick={() => setShowConvRevenueSeries((s) => ({ ...s, conversions: !s.conversions }))}>
                  Conversions
                </Button>
              </div>
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: searchSeriesPalette.revenue },
                  conversions: { label: "Conversions", color: searchSeriesPalette.conversions },
                }}
                className="h-[320px] w-full"
                ref={convRevenueChartRef}
              >
                <LineChart data={chartConvRevenue} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="search-revenue-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={searchSeriesPalette.revenue} stopOpacity={0.24} />
                      <stop offset="95%" stopColor={searchSeriesPalette.revenue} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="search-conversions-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={searchSeriesPalette.conversions} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={searchSeriesPalette.conversions} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} stroke="hsl(var(--muted-foreground))" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                    angle={chartConvRevenue.length > 10 ? -45 : 0}
                    textAnchor={chartConvRevenue.length > 10 ? "end" : "middle"}
                    height={chartConvRevenue.length > 10 ? 56 : 30}
                    tickFormatter={(v) => formatChartDateLabel(String(v))}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatCompactNumber(Number(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatCompactNumber(Number(v))}
                  />
                  <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                  {showConvRevenueSeries.revenue ? <Area type="monotone" yAxisId="left" dataKey="revenue" fill="url(#search-revenue-fill)" stroke="none" /> : null}
                  {showConvRevenueSeries.conversions ? <Area type="monotone" yAxisId="right" dataKey="conversions" fill="url(#search-conversions-fill)" stroke="none" /> : null}
                  {showConvRevenueSeries.revenue ? <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={searchSeriesPalette.revenue}
                    strokeWidth={2.5}
                    dot={false}
                    cursor="default"
                    activeDot={{ r: 4, stroke: searchSeriesPalette.revenue, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
                  /> : null}
                  {showConvRevenueSeries.conversions ? <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="conversions"
                    name="Conversions"
                    stroke={searchSeriesPalette.conversions}
                    strokeWidth={2.5}
                    dot={false}
                    cursor="default"
                    activeDot={{ r: 4, stroke: searchSeriesPalette.conversions, strokeWidth: 1.25, fill: "#fff", className: "transition-transform duration-150" }}
                  /> : null}
                  {showTodayOnConvRevenue ? (
                    <ReferenceLine
                      yAxisId="left"
                      x={todayIso}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 4"
                    />
                  ) : null}
                  {chartConvRevenue.length > 30 ? <Brush dataKey="date" height={20} travellerWidth={8} /> : null}
                  <Tooltip content={renderConvRevenueTooltip} />
                </LineChart>
              </ChartContainer>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Daily Delivery</div>
                <div className="text-xs text-muted-foreground">
                  {dailyTableRows.length ? `${dailyTableRows.length} rows` : "—"}
                </div>
              </div>

              {dailyTableRows.length === 0 ? (
                <div className="rounded-2xl border border-muted/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No daily delivery rows are available for this date range yet.
                </div>
              ) : (
                <DeliveryTable rows={dailyTableRows} />
              )}
            </div>

            {lineItemSeries.length ? (
              <Accordion type="multiple" defaultValue={[]}>
                {lineItemSeries
                  .slice()
                  .sort((a, b) => {
                    const an = (a.lineItemName ?? a.lineItemId).toLowerCase()
                    const bn = (b.lineItemName ?? b.lineItemId).toLowerCase()
                    return an.localeCompare(bn)
                  })
                  .map((li, accIdx) => {
                    const id = String(li.lineItemId ?? "").trim().toLowerCase()
                    const schedule = scheduleByLineItemId.get(id)
                    const bursts = schedule?.bursts ?? []
                    const spend = computeToDateFromBursts(bursts, asAtISO, "budget")
                    const clicks = computeToDateFromBursts(bursts, asAtISO, "clicksGoal")

                    const budgetPacingPct = spend.expectedToDate > 0 ? (li.totals.cost / spend.expectedToDate) * 100 : undefined
                    const clicksPacingPct = clicks.expectedToDate > 0 ? (li.totals.clicks / clicks.expectedToDate) * 100 : undefined
                    const headerPacingPct = typeof budgetPacingPct === "number" ? budgetPacingPct : 0
                    const pacingTone = pacingDeviationBorderClass(headerPacingPct)
                    const sparklineTone = pacingDeviationSparklineClass(headerPacingPct)

                    const liCtr = safeDiv(li.totals.clicks, li.totals.impressions)
                    const liCvr = safeDiv(li.totals.conversions, li.totals.clicks)
                    const liActualCpc = safeDiv(li.totals.cost, li.totals.clicks)
                    const liExpectedCpc = safeDiv(spend.expectedToDate, clicks.expectedToDate)
                    const liCpcPacingPct =
                      liExpectedCpc !== null && liActualCpc !== null && liActualCpc > 0 ? (liExpectedCpc / liActualCpc) * 100 : undefined

                    const liExpectedConversions =
                      clicks.expectedToDate > 0 && liCvr !== null ? clicks.expectedToDate * liCvr : null
                    const liConversionsPacingPct =
                      liExpectedConversions !== null && liExpectedConversions > 0
                        ? (li.totals.conversions / liExpectedConversions) * 100
                        : undefined

                    const liExpectedImpressions =
                      clicks.expectedToDate > 0 && liCtr !== null && liCtr > 0 ? clicks.expectedToDate / liCtr : null
                    const liImpressionsPacingPct =
                      liExpectedImpressions !== null && liExpectedImpressions > 0
                        ? (li.totals.impressions / liExpectedImpressions) * 100
                        : undefined

                    const TOP_SHARE_TARGET = 0.5
                    const liTopSharePacingPct =
                      li.totals.topImpressionPct !== null ? (li.totals.topImpressionPct / TOP_SHARE_TARGET) * 100 : undefined

                    const liTable = buildDailyTableRows(li.daily)
                    const costAccent = brandColour ?? searchSeriesPalette.cost

                    return (
                      <AccordionItem
                        key={id}
                        value={id}
                        className={cn(
                          "campaign-section-enter mb-3 overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:bg-muted/20 data-[state=open]:shadow-sm",
                          pacingTone
                        )}
                        style={{ animationDelay: `${accIdx * 60}ms` }}
                      >
                        <AccordionTrigger className="px-4 py-3 text-left text-sm font-semibold transition-all hover:no-underline">
                          <div className="grid w-full grid-cols-[1fr_auto] items-center gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className={cn("h-[28px] w-[80px]", sparklineTone)}>
                                <Sparkline data={li.daily.map((d) => Number(d.cost ?? 0))} height={28} />
                              </div>
                              <div className="flex flex-col text-left">
                              <span className="truncate font-medium">{li.lineItemName || li.lineItemId}</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {li.lineItemId}
                                {schedule?.buyType ? ` • ${schedule.buyType}` : ""}
                              </span>
                            </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="rounded-full bg-muted px-3 py-1 text-[11px] text-foreground">
                                {formatCurrency(spend.bookedTotal)}
                              </Badge>
                              <Badge className="rounded-full bg-muted px-3 py-1 text-[11px] text-foreground">
                                {formatNumber(li.totals.clicks)} clicks
                              </Badge>
                              <PacingStatusBadge pacingPct={typeof budgetPacingPct === "number" ? budgetPacingPct : 0} size="sm" />
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 border-t bg-muted/5 p-4 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <SmallProgressCard
                              label="Budget pacing"
                              value={formatCurrency(li.totals.cost)}
                              helper={`Delivered ${formatCurrency(li.totals.cost)} • Planned ${formatCurrency(spend.bookedTotal)}`}
                              pacingPct={typeof budgetPacingPct === "number" ? budgetPacingPct : undefined}
                              progressRatio={spend.bookedTotal > 0 ? clampProgress(li.totals.cost / spend.bookedTotal) : 0}
                              accentColor={searchCostAccent}
                              embedded
                            />
                            <SmallProgressCard
                              label="Clicks pacing"
                              value={formatNumber(li.totals.clicks)}
                              helper={`Delivered ${formatNumber(li.totals.clicks)} • Planned ${formatNumber(clicks.bookedTotal)}`}
                              pacingPct={typeof clicksPacingPct === "number" ? clicksPacingPct : undefined}
                              progressRatio={clicks.bookedTotal > 0 ? clampProgress(li.totals.clicks / clicks.bookedTotal) : 0}
                              accentColor={searchSeriesPalette.clicks}
                              embedded
                            />
                          </div>

                          <div className="space-y-4 rounded-2xl border border-muted/60 bg-muted/10 p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <SmallProgressCard
                                label="CPC"
                                value={liActualCpc === null ? "—" : formatCurrency(liActualCpc)}
                                helper={liExpectedCpc === null ? undefined : `Expected ${formatCurrency(liExpectedCpc)}`}
                                pacingPct={typeof liCpcPacingPct === "number" ? liCpcPacingPct : undefined}
                                progressRatio={clampProgress((liCpcPacingPct ?? 0) / 100)}
                                accentColor={searchSeriesPalette.clicks}
                                embedded
                              />
                              <SmallProgressCard
                                label="Conversions"
                                value={formatNumber(li.totals.conversions)}
                                helper={
                                  liExpectedConversions === null ? undefined : `Expected ${formatNumber(liExpectedConversions)}`
                                }
                                pacingPct={typeof liConversionsPacingPct === "number" ? liConversionsPacingPct : undefined}
                                progressRatio={clampProgress((liConversionsPacingPct ?? 0) / 100)}
                                accentColor={searchSeriesPalette.conversions}
                                embedded
                              />
                              <SmallProgressCard
                                label="Top Impression share"
                                value={formatPercentAuto(li.totals.topImpressionPct, 2)}
                                helper="Target 50%"
                                pacingPct={typeof liTopSharePacingPct === "number" ? liTopSharePacingPct : undefined}
                                progressRatio={clampProgress((liTopSharePacingPct ?? 0) / 100)}
                                accentColor={costAccent}
                                embedded
                              />
                              <SmallProgressCard
                                label="Impressions"
                                value={formatNumber(li.totals.impressions)}
                                helper={
                                  liExpectedImpressions === null ? undefined : `Expected ${formatNumber(liExpectedImpressions)}`
                                }
                                pacingPct={typeof liImpressionsPacingPct === "number" ? liImpressionsPacingPct : undefined}
                                progressRatio={clampProgress((liImpressionsPacingPct ?? 0) / 100)}
                                accentColor={costAccent}
                                embedded
                              />
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">Daily Clicks + Spend</div>
                                  <div className="text-xs text-muted-foreground">{li.daily.length ? `${li.daily.length} days` : "—"}</div>
                                </div>
                                <ChartContainer
                                  config={{
                                    cost: { label: "Cost", color: costAccent },
                                    clicks: { label: "Clicks", color: searchSeriesPalette.clicks },
                                  }}
                                  className="h-[320px] w-full"
                                >
                                  <LineChart data={li.daily} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={`li-${id}-cost-fill`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={costAccent} stopOpacity={0.24} />
                                        <stop offset="95%" stopColor={costAccent} stopOpacity={0} />
                                      </linearGradient>
                                      <linearGradient id={`li-${id}-clicks-fill`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={searchSeriesPalette.clicks} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={searchSeriesPalette.clicks} stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} stroke="hsl(var(--muted-foreground))" />
                                    <XAxis
                                      dataKey="date"
                                      tickLine={false}
                                      axisLine={false}
                                      minTickGap={16}
                                      angle={li.daily.length > 10 ? -45 : 0}
                                      textAnchor={li.daily.length > 10 ? "end" : "middle"}
                                      height={li.daily.length > 10 ? 56 : 30}
                                      tickFormatter={(v) => formatChartDateLabel(String(v))}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                    />
                                    <YAxis
                                      yAxisId="left"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatCompactNumber(Number(v))}
                                    />
                                    <YAxis
                                      yAxisId="right"
                                      orientation="right"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatCompactNumber(Number(v))}
                                    />
                                    <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                                    <Area type="monotone" yAxisId="left" dataKey="cost" fill={`url(#li-${id}-cost-fill)`} stroke="none" />
                                    <Area type="monotone" yAxisId="right" dataKey="clicks" fill={`url(#li-${id}-clicks-fill)`} stroke="none" />
                                    <Line
                                      type="monotone"
                                      yAxisId="left"
                                      dataKey="cost"
                                      name="Cost"
                                      stroke={costAccent}
                                      strokeWidth={2.5}
                                      dot={false}
                                      cursor="default"
                                      activeDot={{ r: 4, stroke: costAccent, strokeWidth: 1.25, fill: "#fff" }}
                                    />
                                    <Line
                                      type="monotone"
                                      yAxisId="right"
                                      dataKey="clicks"
                                      name="Clicks"
                                      stroke={searchSeriesPalette.clicks}
                                      strokeWidth={2.5}
                                      dot={false}
                                      cursor="default"
                                      activeDot={{ r: 4, stroke: searchSeriesPalette.clicks, strokeWidth: 1.25, fill: "#fff" }}
                                    />
                                    {li.daily.some((d) => d.date === todayIso) ? (
                                      <ReferenceLine
                                        yAxisId="left"
                                        x={todayIso}
                                        stroke="hsl(var(--muted-foreground))"
                                        strokeDasharray="4 4"
                                      />
                                    ) : null}
                                    {li.daily.length > 30 ? <Brush dataKey="date" height={20} travellerWidth={8} /> : null}
                                    <Tooltip
                                      content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null
                                        const date = String(label ?? "")
                                        const idx = li.daily.findIndex((r) => String(r.date) === date)
                                        const prev = idx > 0 ? li.daily[idx - 1] : undefined
                                        const prevTotal = prev ? Number(prev.cost ?? 0) + Number(prev.clicks ?? 0) : undefined
                                        return (
                                          <UnifiedTooltip
                                            active={Boolean(active)}
                                            label={date}
                                            formatLabel={(l) => formatChartDateLabel(l)}
                                            payload={normalizeRechartsTooltipPayload(
                                              payload as UnifiedTooltipRechartsPayloadEntry[],
                                            )}
                                            formatValue={(v) => formatCompactNumber(v)}
                                            showPercentages={false}
                                            comparison={
                                              typeof prevTotal === "number"
                                                ? { value: prevTotal, label: "vs previous day" }
                                                : undefined
                                            }
                                          />
                                        )
                                      }}
                                    />
                                  </LineChart>
                                </ChartContainer>
                              </div>

                              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">Daily Conversions + Revenue</div>
                                  <div className="text-xs text-muted-foreground">{li.daily.length ? `${li.daily.length} days` : "—"}</div>
                                </div>
                                <ChartContainer
                                  config={{
                                    revenue: { label: "Revenue", color: searchSeriesPalette.revenue },
                                    conversions: { label: "Conversions", color: searchSeriesPalette.conversions },
                                  }}
                                  className="h-[320px] w-full"
                                >
                                  <LineChart data={li.daily} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={`li-${id}-revenue-fill`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={searchSeriesPalette.revenue} stopOpacity={0.24} />
                                        <stop offset="95%" stopColor={searchSeriesPalette.revenue} stopOpacity={0} />
                                      </linearGradient>
                                      <linearGradient id={`li-${id}-conversions-fill`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={searchSeriesPalette.conversions} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={searchSeriesPalette.conversions} stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} stroke="hsl(var(--muted-foreground))" />
                                    <XAxis
                                      dataKey="date"
                                      tickLine={false}
                                      axisLine={false}
                                      minTickGap={16}
                                      angle={li.daily.length > 10 ? -45 : 0}
                                      textAnchor={li.daily.length > 10 ? "end" : "middle"}
                                      height={li.daily.length > 10 ? 56 : 30}
                                      tickFormatter={(v) => formatChartDateLabel(String(v))}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                    />
                                    <YAxis
                                      yAxisId="left"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatCompactNumber(Number(v))}
                                    />
                                    <YAxis
                                      yAxisId="right"
                                      orientation="right"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatCompactNumber(Number(v))}
                                    />
                                    <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                                    <Area type="monotone" yAxisId="left" dataKey="revenue" fill={`url(#li-${id}-revenue-fill)`} stroke="none" />
                                    <Area type="monotone" yAxisId="right" dataKey="conversions" fill={`url(#li-${id}-conversions-fill)`} stroke="none" />
                                    <Line
                                      type="monotone"
                                      yAxisId="left"
                                      dataKey="revenue"
                                      name="Revenue"
                                      stroke={searchSeriesPalette.revenue}
                                      strokeWidth={2.5}
                                      dot={false}
                                      cursor="default"
                                      activeDot={{ r: 4, stroke: searchSeriesPalette.revenue, strokeWidth: 1.25, fill: "#fff" }}
                                    />
                                    <Line
                                      type="monotone"
                                      yAxisId="right"
                                      dataKey="conversions"
                                      name="Conversions"
                                      stroke={searchSeriesPalette.conversions}
                                      strokeWidth={2.5}
                                      dot={false}
                                      cursor="default"
                                      activeDot={{ r: 4, stroke: searchSeriesPalette.conversions, strokeWidth: 1.25, fill: "#fff" }}
                                    />
                                    {li.daily.some((d) => d.date === todayIso) ? (
                                      <ReferenceLine
                                        yAxisId="left"
                                        x={todayIso}
                                        stroke="hsl(var(--muted-foreground))"
                                        strokeDasharray="4 4"
                                      />
                                    ) : null}
                                    {li.daily.length > 30 ? <Brush dataKey="date" height={20} travellerWidth={8} /> : null}
                                    <Tooltip
                                      content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null
                                        const date = String(label ?? "")
                                        const idx = li.daily.findIndex((r) => String(r.date) === date)
                                        const prev = idx > 0 ? li.daily[idx - 1] : undefined
                                        const prevTotal = prev ? Number(prev.revenue ?? 0) + Number(prev.conversions ?? 0) : undefined
                                        return (
                                          <UnifiedTooltip
                                            active={Boolean(active)}
                                            label={date}
                                            formatLabel={(l) => formatChartDateLabel(l)}
                                            payload={normalizeRechartsTooltipPayload(
                                              payload as UnifiedTooltipRechartsPayloadEntry[],
                                            )}
                                            formatValue={(v) => formatCompactNumber(v)}
                                            showPercentages={false}
                                            comparison={
                                              typeof prevTotal === "number"
                                                ? { value: prevTotal, label: "vs previous day" }
                                                : undefined
                                            }
                                          />
                                        )
                                      }}
                                    />
                                  </LineChart>
                                </ChartContainer>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold">Daily Delivery</div>
                              <div className="text-xs text-muted-foreground">{liTable.length ? `${liTable.length} rows` : "—"}</div>
                            </div>
                            {liTable.length === 0 ? (
                              <div className="rounded-2xl border border-muted/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                                No daily delivery rows are available for this date range yet.
                              </div>
                            ) : (
                              <DeliveryTable rows={liTable} />
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
              </Accordion>
            ) : null}

          </>
        )}
    </div>
  )
}

