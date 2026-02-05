"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@/components/AuthWrapper"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart"

type SearchPacingContainerProps = {
  clientSlug: string
  mbaNumber: string
  startDate: string
  endDate: string
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

type ApiKeywordRow = {
  keywordId: string
  keywordName: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  revenue: number
  topImpressionPct: number | null
  absTopImpressionPct: number | null
}

type ApiResponse = {
  totals: ApiTotals
  daily: ApiDailyRow[]
  keywords: ApiKeywordRow[]
}

const IS_DEV = process.env.NODE_ENV !== "production"
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

const palette = {
  cost: "#4f8fcb",
  clicks: "#15c7c9",
  conversions: "#22c55e",
  revenue: "#a855f7",
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
  startDate,
  endDate,
}: SearchPacingContainerProps): React.ReactElement | null {
  const { user, isLoading: authLoading } = useUser()

  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingFetchKeyRef = useRef<string | null>(null)
  const lastSuccessfulFetchKeyRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const fetchKey = useMemo(() => `${mbaNumber}|${startDate}|${endDate}`, [mbaNumber, startDate, endDate])

  const fetchSearchPacing = async (retryAttempt = 0) => {
    cancelledRef.current = false
    setIsLoading(true)
    setError(null)

    if (IS_DEV || DEBUG_PACING) {
      console.log("[PACING UI] calling /api/pacing/search", {
        fetchKey,
        retryAttempt,
        mbaNumber,
        startDate,
        endDate,
      })
    }

    try {
      const url =
        `/api/pacing/search?mbaNumber=${encodeURIComponent(mbaNumber)}` +
        `&startDate=${encodeURIComponent(startDate)}` +
        `&endDate=${encodeURIComponent(endDate)}`

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      })

      // Match existing pacing retry behavior on auth-ish responses.
      if (response.status === 401 || response.status === 403 || response.status === 302) {
        if (retryAttempt === 0) {
          setTimeout(() => {
            if (!cancelledRef.current) {
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

      const json = (await parseJsonSafely(response)) as ApiResponse
      if (cancelledRef.current) return

      lastSuccessfulFetchKeyRef.current = fetchKey
      pendingFetchKeyRef.current = null
      setData(json)
      setError(null)
    } catch (err) {
      if (cancelledRef.current) return
      pendingFetchKeyRef.current = null
      const message = err instanceof Error ? err.message : String(err)

      // Retry once if we got HTML/non-JSON (often auth redirect)
      if (message.includes("Expected JSON but got") && retryAttempt === 0) {
        setTimeout(() => {
          if (!cancelledRef.current) {
            fetchSearchPacing(1)
          }
        }, 400)
        return
      }

      setError(message)
    } finally {
      if (!cancelledRef.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    // Guard: wait for auth and user
    if (authLoading) return
    if (!user) return
    if (!mbaNumber || !startDate || !endDate) return

    if (pendingFetchKeyRef.current === fetchKey) return
    if (lastSuccessfulFetchKeyRef.current === fetchKey) return

    pendingFetchKeyRef.current = fetchKey
    fetchSearchPacing(0)

    return () => {
      cancelledRef.current = true
    }
  }, [authLoading, user, fetchKey, mbaNumber, startDate, endDate])

  const totals = data?.totals ?? {
    cost: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    impressions: 0,
    topImpressionPct: null,
  }

  const daily = Array.isArray(data?.daily) ? data!.daily : []
  const keywords = Array.isArray(data?.keywords) ? data!.keywords.slice(0, 100) : []

  const hasAnyData = daily.length > 0 || keywords.length > 0

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

  const CalloutCards = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border-muted/70 shadow-sm">
        <CardContent className="flex flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="text-xs font-medium text-muted-foreground">Cost</div>
          <div className="text-3xl font-semibold leading-tight">{formatCurrency(totals.cost)}</div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-muted/70 shadow-sm">
        <CardContent className="flex flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="text-xs font-medium text-muted-foreground">Clicks</div>
          <div className="text-3xl font-semibold leading-tight">{formatNumber(totals.clicks)}</div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-muted/70 shadow-sm">
        <CardContent className="flex flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="text-xs font-medium text-muted-foreground">Conversions</div>
          <div className="text-3xl font-semibold leading-tight">{formatNumber(totals.conversions)}</div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-muted/70 shadow-sm">
        <CardContent className="flex flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="text-xs font-medium text-muted-foreground">Top Impression %</div>
          <div className="text-3xl font-semibold leading-tight">
            {formatPercentAuto(totals.topImpressionPct)}
          </div>
        </CardContent>
      </Card>
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
            {CalloutCards}

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
                <div className="text-sm font-semibold">Top Keywords</div>
                <div className="text-xs text-muted-foreground">{keywords.length ? `${keywords.length} rows` : "—"}</div>
              </div>

              {keywords.length === 0 ? (
                <div className="rounded-2xl border border-muted/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No keyword data is available for this date range yet.
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <div className="max-h-[520px] overflow-auto">
                    <div className="sticky top-0 z-10 bg-muted/70 backdrop-blur border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
                      <div
                        className="grid items-center gap-3"
                        style={{
                          gridTemplateColumns:
                            "minmax(280px, 1fr) 110px 130px 120px 120px 120px 150px 170px",
                        }}
                      >
                        <div>Keyword</div>
                        <div className="text-right">Clicks</div>
                        <div className="text-right">Impressions</div>
                        <div className="text-right">Cost</div>
                        <div className="text-right">Conversions</div>
                        <div className="text-right">Revenue</div>
                        <div className="text-right">Top Impression %</div>
                        <div className="text-right">Abs Top Impression %</div>
                      </div>
                    </div>

                    {keywords.map((row) => (
                      <div
                        key={`${row.keywordId}:${row.keywordName}`}
                        className="grid items-center gap-3 border-b last:border-b-0 px-3 py-2 text-sm"
                        style={{
                          gridTemplateColumns:
                            "minmax(280px, 1fr) 110px 130px 120px 120px 120px 150px 170px",
                        }}
                      >
                        <div className="font-medium truncate" title={row.keywordName || row.keywordId}>
                          {row.keywordName || row.keywordId}
                        </div>
                        <div className="text-right">{formatNumber(row.clicks)}</div>
                        <div className="text-right">{formatNumber(row.impressions)}</div>
                        <div className="text-right">{formatCurrency(row.cost)}</div>
                        <div className="text-right">{formatNumber(row.conversions)}</div>
                        <div className="text-right">{formatCurrency(row.revenue)}</div>
                        <div className="text-right">{formatPercentAuto(row.topImpressionPct)}</div>
                        <div className="text-right">{formatPercentAuto(row.absTopImpressionPct)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

