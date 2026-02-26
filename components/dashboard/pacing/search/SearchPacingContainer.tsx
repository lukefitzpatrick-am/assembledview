"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@/components/AuthWrapper"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart"
import { clampProgress, SmallProgressCard } from "@/components/dashboard/pacing/SmallProgressCard"

type SearchPacingContainerProps = {
  clientSlug: string
  mbaNumber: string
  lineItemIds: string[]
  searchLineItems?: any[]
  campaignPlannedEndDate?: string
  startDate: string
  endDate: string
  initialSearchData?: ApiResponse | null
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

const palette = {
  cost: "#4f8fcb",
  clicks: "#15c7c9",
  conversions: "#22c55e",
  revenue: "#a855f7",
}

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
  const COLS =
    "130px 120px 130px 110px 90px 110px 110px 120px 110px 120px 120px 150px"
  const totals = summarizeDeliveryTable(rows)

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="max-h-[520px] overflow-auto">
        <div className="sticky top-0 z-10 bg-muted/70 backdrop-blur border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
            <div>Date</div>
            <div className="text-right">Cost</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">CTR</div>
            <div className="text-right">CPM</div>
            <div className="text-right">CPC</div>
            <div className="text-right">Conversions</div>
            <div className="text-right">CPA</div>
            <div className="text-right">Revenue</div>
            <div className="text-right">ROAS</div>
            <div className="text-right">Top Impression %</div>
          </div>
        </div>

        {rows.map((row) => (
          <div
            key={row.date}
            className="grid items-center gap-3 border-b last:border-b-0 px-3 py-2 text-sm"
            style={{ gridTemplateColumns: COLS }}
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
}: SearchPacingContainerProps): React.ReactElement | null {
  const { user, isLoading: authLoading } = useUser()

  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingFetchKeyRef = useRef<string | null>(null)
  const lastSuccessfulFetchKeyRef = useRef<string | null>(null)
  const requestSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)

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

  const fetchSearchPacing = async (retryAttempt = 0) => {
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
  }

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
    // Avoid effect churn if useUser returns a new object identity.
    user?.sub ?? user?.email ?? null,
    initialSearchData,
    fetchKey,
    startDate,
    endDate,
    normalizedLineItemIds.length,
  ])

  const totals = data?.totals ?? {
    cost: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    impressions: 0,
    topImpressionPct: null,
  }

  const windowStartISO = parseISODateOnlyOrNull(startDate) ?? startDate
  const windowEndISO = parseISODateOnlyOrNull(endDate) ?? endDate

  const rawDaily = Array.isArray(data?.daily) ? data!.daily : []
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

  const dailyTableRows = useMemo(() => buildDailyTableRows(daily), [daily])

  const totalSecondaryCards = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SmallProgressCard
        label="CPC"
        value={totalDerived.actualCpc === null ? "—" : formatCurrency(totalDerived.actualCpc)}
        helper={
          totalDerived.expectedCpc === null ? undefined : `Expected ${formatCurrency(totalDerived.expectedCpc)}`
        }
        pacingPct={typeof totalDerived.cpcPacingPct === "number" ? totalDerived.cpcPacingPct : undefined}
        progressRatio={clampProgress((totalDerived.cpcPacingPct ?? 0) / 100)}
        accentColor={palette.clicks}
      />
      <SmallProgressCard
        label="Conversions"
        value={formatNumber(totals.conversions)}
        helper={
          totalDerived.expectedConversions === null ? undefined : `Expected ${formatNumber(totalDerived.expectedConversions)}`
        }
        pacingPct={typeof totalDerived.conversionsPacingPct === "number" ? totalDerived.conversionsPacingPct : undefined}
        progressRatio={clampProgress((totalDerived.conversionsPacingPct ?? 0) / 100)}
        accentColor={palette.conversions}
      />
      <SmallProgressCard
        label="Top Impression share"
        value={formatPercentAuto(totals.topImpressionPct, 2)}
        helper="Target 50%"
        pacingPct={typeof totalDerived.topSharePacingPct === "number" ? totalDerived.topSharePacingPct : undefined}
        progressRatio={clampProgress((totalDerived.topSharePacingPct ?? 0) / 100)}
        accentColor={palette.cost}
      />
      <SmallProgressCard
        label="Impressions"
        value={formatNumber(totals.impressions)}
        helper={
          totalDerived.expectedImpressions === null ? undefined : `Expected ${formatNumber(totalDerived.expectedImpressions)}`
        }
        pacingPct={typeof totalDerived.impressionsPacingPct === "number" ? totalDerived.impressionsPacingPct : undefined}
        progressRatio={clampProgress((totalDerived.impressionsPacingPct ?? 0) / 100)}
        accentColor={palette.cost}
      />
    </div>
  )

  return (
    <Card className="rounded-3xl border-muted/70 bg-background/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Search Performance</CardTitle>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
              {clientSlug} • {mbaNumber}
            </Badge>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
            {startDate} → {endDate}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="rounded-2xl border border-muted/60 bg-muted/10 p-4 text-sm text-muted-foreground">
            No Search pacing data is available for this date range yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallProgressCard
                label="Budget pacing"
                value={formatCurrency(totals.cost)}
                helper={`Delivered ${formatCurrency(totals.cost)} • Planned ${formatCurrency(totalSchedule.budgetBooked)}`}
                pacingPct={typeof totalDerived.budgetPacingPct === "number" ? totalDerived.budgetPacingPct : undefined}
                progressRatio={
                  totalSchedule.budgetBooked > 0 ? clampProgress(totals.cost / totalSchedule.budgetBooked) : 0
                }
                accentColor={palette.cost}
              />
              <SmallProgressCard
                label="Clicks pacing"
                value={formatNumber(totals.clicks)}
                helper={`Delivered ${formatNumber(totals.clicks)} • Planned ${formatNumber(totalSchedule.clicksBooked)}`}
                pacingPct={typeof totalDerived.clicksPacingPct === "number" ? totalDerived.clicksPacingPct : undefined}
                progressRatio={
                  totalSchedule.clicksBooked > 0 ? clampProgress(totals.clicks / totalSchedule.clicksBooked) : 0
                }
                accentColor={palette.clicks}
              />
            </div>

            {totalSecondaryCards}

            <div className="space-y-4 rounded-2xl border border-muted/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Daily Clicks + Spend</div>
                <div className="text-xs text-muted-foreground">{daily.length ? `${daily.length} days` : "—"}</div>
              </div>
              <ChartContainer
                config={{
                  cost: { label: "Cost", color: palette.cost },
                  clicks: { label: "Clicks", color: palette.clicks },
                }}
                className="h-[320px] w-full"
              >
                <LineChart data={chartClicksSpend} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
                    tickFormatter={(v) => formatCurrency(Number(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatNumber(Number(v))}
                  />
                  <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                  <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="cost"
                    name="Cost"
                    stroke={palette.cost}
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{ r: 4, stroke: palette.cost, strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="clicks"
                    name="Clicks"
                    stroke={palette.clicks}
                    strokeWidth={2.4}
                    dot={false}
                    activeDot={{ r: 4, stroke: palette.clicks, strokeWidth: 1 }}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const point = payload[0].payload as { date: string; clicks: number; cost: number }
                      return (
                        <div className="min-w-[220px] rounded-md border bg-popover p-3 shadow-md text-xs">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="font-semibold leading-tight">Clicks + Spend</div>
                            <div className="text-[11px] text-muted-foreground">{formatDateAU(point.date)}</div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-4">
                              <span>Cost</span>
                              <span className="font-medium">{formatCurrency(point.cost)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span>Clicks</span>
                              <span className="font-medium">{formatNumber(point.clicks)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                </LineChart>
              </ChartContainer>
            </div>

            <div className="space-y-4 rounded-2xl border border-muted/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Daily Conversions + Revenue</div>
                <div className="text-xs text-muted-foreground">{daily.length ? `${daily.length} days` : "—"}</div>
              </div>
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: palette.revenue },
                  conversions: { label: "Conversions", color: palette.conversions },
                }}
                className="h-[320px] w-full"
              >
                <LineChart data={chartConvRevenue} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
                    tickFormatter={(v) => formatCurrency(Number(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatNumber(Number(v))}
                  />
                  <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                  <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={palette.revenue}
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{ r: 4, stroke: palette.revenue, strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="conversions"
                    name="Conversions"
                    stroke={palette.conversions}
                    strokeWidth={2.4}
                    dot={false}
                    activeDot={{ r: 4, stroke: palette.conversions, strokeWidth: 1 }}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const point = payload[0].payload as { date: string; conversions: number; revenue: number }
                      return (
                        <div className="min-w-[220px] rounded-md border bg-popover p-3 shadow-md text-xs">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="font-semibold leading-tight">Conversions + Revenue</div>
                            <div className="text-[11px] text-muted-foreground">{formatDateAU(point.date)}</div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-4">
                              <span>Revenue</span>
                              <span className="font-medium">{formatCurrency(point.revenue)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span>Conversions</span>
                              <span className="font-medium">{formatNumber(point.conversions)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
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
                  .map((li) => {
                    const id = String(li.lineItemId ?? "").trim().toLowerCase()
                    const schedule = scheduleByLineItemId.get(id)
                    const bursts = schedule?.bursts ?? []
                    const spend = computeToDateFromBursts(bursts, asAtISO, "budget")
                    const clicks = computeToDateFromBursts(bursts, asAtISO, "clicksGoal")

                    const budgetPacingPct = spend.expectedToDate > 0 ? (li.totals.cost / spend.expectedToDate) * 100 : undefined
                    const clicksPacingPct = clicks.expectedToDate > 0 ? (li.totals.clicks / clicks.expectedToDate) * 100 : undefined

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

                    return (
                      <AccordionItem key={id} value={id}>
                        <AccordionTrigger className="rounded-xl px-3 py-2 text-left text-sm font-semibold">
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="flex flex-col text-left">
                              <span>{li.lineItemName || li.lineItemId}</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {li.lineItemId}
                                {schedule?.buyType ? ` • ${schedule.buyType}` : ""}
                              </span>
                            </div>
                            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                              {formatCurrency(spend.bookedTotal)}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <SmallProgressCard
                              label="Budget pacing"
                              value={formatCurrency(li.totals.cost)}
                              helper={`Delivered ${formatCurrency(li.totals.cost)} • Planned ${formatCurrency(spend.bookedTotal)}`}
                              pacingPct={typeof budgetPacingPct === "number" ? budgetPacingPct : undefined}
                              progressRatio={spend.bookedTotal > 0 ? clampProgress(li.totals.cost / spend.bookedTotal) : 0}
                              accentColor={palette.cost}
                            />
                            <SmallProgressCard
                              label="Clicks pacing"
                              value={formatNumber(li.totals.clicks)}
                              helper={`Delivered ${formatNumber(li.totals.clicks)} • Planned ${formatNumber(clicks.bookedTotal)}`}
                              pacingPct={typeof clicksPacingPct === "number" ? clicksPacingPct : undefined}
                              progressRatio={clicks.bookedTotal > 0 ? clampProgress(li.totals.clicks / clicks.bookedTotal) : 0}
                              accentColor={palette.clicks}
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
                                accentColor={palette.clicks}
                              />
                              <SmallProgressCard
                                label="Conversions"
                                value={formatNumber(li.totals.conversions)}
                                helper={
                                  liExpectedConversions === null ? undefined : `Expected ${formatNumber(liExpectedConversions)}`
                                }
                                pacingPct={typeof liConversionsPacingPct === "number" ? liConversionsPacingPct : undefined}
                                progressRatio={clampProgress((liConversionsPacingPct ?? 0) / 100)}
                                accentColor={palette.conversions}
                              />
                              <SmallProgressCard
                                label="Top Impression share"
                                value={formatPercentAuto(li.totals.topImpressionPct, 2)}
                                helper="Target 50%"
                                pacingPct={typeof liTopSharePacingPct === "number" ? liTopSharePacingPct : undefined}
                                progressRatio={clampProgress((liTopSharePacingPct ?? 0) / 100)}
                                accentColor={palette.cost}
                              />
                              <SmallProgressCard
                                label="Impressions"
                                value={formatNumber(li.totals.impressions)}
                                helper={
                                  liExpectedImpressions === null ? undefined : `Expected ${formatNumber(liExpectedImpressions)}`
                                }
                                pacingPct={typeof liImpressionsPacingPct === "number" ? liImpressionsPacingPct : undefined}
                                progressRatio={clampProgress((liImpressionsPacingPct ?? 0) / 100)}
                                accentColor={palette.cost}
                              />
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-4 rounded-2xl border border-muted/60 bg-background/80 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">Daily Clicks + Spend</div>
                                  <div className="text-xs text-muted-foreground">{li.daily.length ? `${li.daily.length} days` : "—"}</div>
                                </div>
                                <ChartContainer
                                  config={{
                                    cost: { label: "Cost", color: palette.cost },
                                    clicks: { label: "Clicks", color: palette.clicks },
                                  }}
                                  className="h-[320px] w-full"
                                >
                                  <LineChart data={li.daily} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
                                      tickFormatter={(v) => formatCurrency(Number(v))}
                                    />
                                    <YAxis
                                      yAxisId="right"
                                      orientation="right"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatNumber(Number(v))}
                                    />
                                    <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                                    <Line
                                      type="monotone"
                                      yAxisId="left"
                                      dataKey="cost"
                                      name="Cost"
                                      stroke={palette.cost}
                                      strokeWidth={2.6}
                                      dot={false}
                                    />
                                    <Line
                                      type="monotone"
                                      yAxisId="right"
                                      dataKey="clicks"
                                      name="Clicks"
                                      stroke={palette.clicks}
                                      strokeWidth={2.4}
                                      dot={false}
                                    />
                                  </LineChart>
                                </ChartContainer>
                              </div>

                              <div className="space-y-4 rounded-2xl border border-muted/60 bg-background/80 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">Daily Conversions + Revenue</div>
                                  <div className="text-xs text-muted-foreground">{li.daily.length ? `${li.daily.length} days` : "—"}</div>
                                </div>
                                <ChartContainer
                                  config={{
                                    revenue: { label: "Revenue", color: palette.revenue },
                                    conversions: { label: "Conversions", color: palette.conversions },
                                  }}
                                  className="h-[320px] w-full"
                                >
                                  <LineChart data={li.daily} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
                                      tickFormatter={(v) => formatCurrency(Number(v))}
                                    />
                                    <YAxis
                                      yAxisId="right"
                                      orientation="right"
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                      tickFormatter={(v) => formatNumber(Number(v))}
                                    />
                                    <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
                                    <Line
                                      type="monotone"
                                      yAxisId="left"
                                      dataKey="revenue"
                                      name="Revenue"
                                      stroke={palette.revenue}
                                      strokeWidth={2.6}
                                      dot={false}
                                    />
                                    <Line
                                      type="monotone"
                                      yAxisId="right"
                                      dataKey="conversions"
                                      name="Conversions"
                                      stroke={palette.conversions}
                                      strokeWidth={2.4}
                                      dot={false}
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
      </CardContent>
    </Card>
  )
}

