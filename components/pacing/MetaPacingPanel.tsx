"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CartesianGrid,
  XAxis,
  YAxis,
  LineChart,
  Line,
} from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart"
import {
  Tooltip,
  TooltipContent as ShadTooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import PacingGaugeCard from "@/components/dashboard/PacingGaugeCard"
import { downloadCSV } from "@/lib/utils/csv-export"
import { calcExpectedFromBursts } from "@/lib/pacing/calcExpected"
import {
  PacingResult,
  PacingSeriesPoint,
  calculatePacing,
  getDeliverableKey,
} from "@/lib/pacing/calcPacing"
import {
  ActualsDaily,
  AdSetRow,
  Burst,
  BuyType,
} from "@/lib/pacing/mockMetaPacing"

type ApiLineItem = {
  line_item_id: string
  line_item_name: string
  buy_type: BuyType
  bursts: Burst[]
  actualsDaily: ActualsDaily[]
  adSetRows: AdSetRow[]
  fixed_cost_media?: boolean
}

type ApiResponse = {
  lineItems: ApiLineItem[]
}

type LineItemWithMetrics = {
  data: ApiLineItem
  expected: ReturnType<typeof calcExpectedFromBursts>
  pacing: PacingResult
}

type AggregatedActual = ActualsDaily & { deliverable_value?: number }

const palette = {
  budget: "#4f8fcb",
  deliverable: "#15c7c9",
  accent: "#b5d337",
  brand: "#9801b5",
  highlight: "#fd7adb",
  warning: "#ffcf2a",
  alert: "#ff9700",
  error: "#ff6003",
  success: "#008e5e",
}

const clampRatio = (value: number) => Math.min(Math.max(value, 0), 1)
const round2 = (n: number) => Number((n || 0).toFixed(2))

export default function MetaPacingPanel({
  clientSlug,
  mbaSlug,
}: {
  clientSlug: string
  mbaSlug: string
}) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const url = `/api/pacing/meta?clientSlug=${encodeURIComponent(clientSlug)}&mbaSlug=${encodeURIComponent(
          mbaSlug
        )}&t=${Date.now()}`
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) {
          const details = await res.json().catch(() => ({}))
          throw new Error(details.error || "Failed to load Meta pacing data")
        }
        const json = (await res.json()) as ApiResponse
        if (isMounted) {
          setData(json)
        }
      } catch (err) {
        console.error("[MetaPacingPanel]", err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load Meta pacing data")
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchData()
    return () => {
      isMounted = false
    }
  }, [clientSlug, mbaSlug])

  const lineItems = data?.lineItems ?? []

  const lineItemMetrics: LineItemWithMetrics[] = useMemo(
    () =>
      lineItems.map((item) => {
        const expected = calcExpectedFromBursts(item.bursts)

        const pacing = calculatePacing({
          buyType: item.buy_type,
          actualsDaily: item.actualsDaily,
          expected,
        })
        return { data: item, expected, pacing }
      }),
    [lineItems]
  )

  const containerMetrics = useMemo(() => {
    const aggregatedExpectedMap = new Map<
      string,
      { expected_spend: number; expected_deliverables: number }
    >()
    const aggregatedActualMap = new Map<string, AggregatedActual>()
    let bookedSpendTotal = 0
    let bookedDeliverablesTotal = 0

    lineItemMetrics.forEach((item) => {
      bookedSpendTotal += item.expected.totals.spend
      bookedDeliverablesTotal += item.expected.totals.deliverables

      item.expected.daily.forEach((day) => {
        const existing = aggregatedExpectedMap.get(day.date) ?? {
          expected_spend: 0,
          expected_deliverables: 0,
        }
        aggregatedExpectedMap.set(day.date, {
          expected_spend: existing.expected_spend + day.expected_spend,
          expected_deliverables:
            existing.expected_deliverables + day.expected_deliverables,
        })
      })

      const deliverableKey = getDeliverableKey(item.data.buy_type)
      item.data.actualsDaily.forEach((day) => {
        const deliverableValue =
          deliverableKey && deliverableKey !== "deliverable_value"
            ? (day as unknown as Record<string, number>)[deliverableKey] || 0
            : 0
        const existing = aggregatedActualMap.get(day.date) ?? {
          date: day.date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          results: 0,
          video_3s_views: 0,
          deliverable_value: 0,
        }
        aggregatedActualMap.set(day.date, {
          date: day.date,
          spend: existing.spend + day.spend,
          impressions: existing.impressions + day.impressions,
          clicks: existing.clicks + day.clicks,
          results: existing.results + day.results,
          video_3s_views: existing.video_3s_views + day.video_3s_views,
          deliverable_value: existing.deliverable_value! + deliverableValue,
        })
      })
    })

    const expectedDaily = Array.from(aggregatedExpectedMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({
        date,
        expected_spend: Number(values.expected_spend.toFixed(2)),
        expected_deliverables: Number(values.expected_deliverables.toFixed(2)),
      }))

    let runningSpend = 0
    let runningDeliverables = 0
    const expectedCumulative = expectedDaily.map((day) => {
      runningSpend += day.expected_spend
      runningDeliverables += day.expected_deliverables
      return {
        date: day.date,
        cumulative_expected_spend: Number(runningSpend.toFixed(2)),
        cumulative_expected_deliverables: Number(runningDeliverables.toFixed(2)),
      }
    })

    const aggregatedExpected = {
      daily: expectedDaily,
      cumulative: expectedCumulative,
      totals: {
        spend: round2(bookedSpendTotal),
        deliverables: round2(bookedDeliverablesTotal),
      },
    }

    const aggregatedActuals = Array.from(aggregatedActualMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    )

    const pacing = calculatePacing({
      buyType: "SUMMARY",
      actualsDaily: aggregatedActuals,
      expected: aggregatedExpected,
      deliverableKeyOverride: "deliverable_value",
    })

    return {
      expected: aggregatedExpected,
      pacing,
      actuals: aggregatedActuals,
    }
  }, [lineItemMetrics])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta pacing</CardTitle>
          <CardDescription>Loading Meta pacing data…</CardDescription>
        </CardHeader>
        <CardContent>Loading…</CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta pacing</CardTitle>
          <CardDescription className="text-destructive">Error loading data</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    )
  }

  if (!lineItems.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta pacing</CardTitle>
          <CardDescription>No Meta social line items found.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Add Meta social line items to view pacing.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Meta Social Pacing</h1>
          <Badge variant="secondary">Live Data</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Pacing calculated from Xano line items and Snowflake daily actuals. 100% = on target.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Container Summary</CardTitle>
              <CardDescription>
                Sum of all Meta line items. Tooltips show actual vs expected, delta, pacing %, and
                as-at date.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleDownloadContainerCSVs({
                  containerName: "Meta container",
                  series: containerMetrics.pacing.series,
                  totals: summarizeActuals(containerMetrics.actuals),
                  adSetRows: lineItems.flatMap((item) =>
                    item.adSetRows.map((row) => ({
                      ...row,
                      line_item_name: item.line_item_name,
                    }))
                  ),
                })
              }
            >
              Download CSVs
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-xs text-muted-foreground px-1">
            Booked budget: {formatCurrency(containerMetrics.expected.totals.spend)} • Booked deliverables:{" "}
            {formatNumber(containerMetrics.expected.totals.deliverables)}
          </div>
          <div className="grid gap-3 xl:grid-cols-4 lg:grid-cols-2 auto-rows-[170px]">
            {containerMetrics.pacing.spend ? (
              <div className="flex flex-col">
                <PacingGaugeCard
                  title="Budget pacing %"
                  pacingPct={containerMetrics.pacing.spend.pacingPct}
                  actual={formatCurrency(containerMetrics.pacing.spend.actualToDate)}
                  expected={formatCurrency(containerMetrics.pacing.spend.expectedToDate)}
                  delta={formatCurrency(containerMetrics.pacing.spend.delta)}
                  asAt={containerMetrics.pacing.asAtDate ?? "—"}
                />
                <div className="mt-1 text-xs text-muted-foreground px-1">
                  Booked {formatCurrency(containerMetrics.expected.totals.spend)} • Delivered{" "}
                  {formatCurrency(containerMetrics.pacing.spend.actualToDate)}
                </div>
              </div>
            ) : (
              <Card>
                <KpiHeader title="Budget pacing %" helper="100% = on target" />
                <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                  Not available for this buy type.
                </CardContent>
              </Card>
            )}
            {containerMetrics.pacing.deliverable ? (
              <div className="flex flex-col">
                <PacingGaugeCard
                  title="Deliverable pacing %"
                  pacingPct={containerMetrics.pacing.deliverable.pacingPct}
                  actual={formatNumber(containerMetrics.pacing.deliverable.actualToDate)}
                  expected={formatNumber(containerMetrics.pacing.deliverable.expectedToDate)}
                  delta={formatNumber(containerMetrics.pacing.deliverable.delta)}
                  asAt={containerMetrics.pacing.asAtDate ?? "—"}
                />
                <div className="mt-1 text-xs text-muted-foreground px-1">
                  Booked {formatNumber(containerMetrics.expected.totals.deliverables)} • Delivered{" "}
                  {formatNumber(containerMetrics.pacing.deliverable.actualToDate)}
                </div>
              </div>
            ) : (
              <Card>
                <KpiHeader title="Deliverable pacing %" helper="100% = on target" />
                <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                  Not available for this buy type.
                </CardContent>
              </Card>
            )}
            <FuelGaugeCard
              title="Budget pacing volume"
              helper="Actual vs expected to date"
              summary={containerMetrics.pacing.spend}
              asAtDate={containerMetrics.pacing.asAtDate}
              valueLabel="Budget"
              variant="budget"
              total={containerMetrics.expected.totals.spend}
            />
            <FuelGaugeCard
              title="Deliverable pacing volume"
              helper="Actual vs expected to date"
              summary={containerMetrics.pacing.deliverable}
              asAtDate={containerMetrics.pacing.asAtDate}
              valueLabel="Deliverables"
              variant="deliverable"
              total={containerMetrics.expected.totals.deliverables}
            />
          </div>

          <Card className="shadow-none border-muted overflow-hidden">
            <CardHeader className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Daily delivery</CardTitle>
                  <CardDescription className="text-xs">
                    Actual spend and deliverables with KPI rollups.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="px-6 pt-4">
              <KpiCallouts totals={summarizeActuals(containerMetrics.actuals)} />
            </div>
            <ScrollArea className="max-h-[360px]">
              <div className="px-6 pb-4 pt-2">
                <ActualsDailyDeliveryChart
                  series={containerMetrics.pacing.series}
                  asAtDate={containerMetrics.pacing.asAtDate}
                  deliverableLabel="Deliverables"
                />
              </div>
            </ScrollArea>
            <div className="sticky bottom-0 z-10 border-t bg-background/95 px-6 py-2 text-xs text-muted-foreground">
              As at {containerMetrics.pacing.asAtDate ?? "—"}
            </div>
          </Card>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Line Items</h2>
          <p className="text-sm text-muted-foreground">
            Collapsed by default. Each section mirrors the container layout.
          </p>
        </div>

        <Accordion type="multiple" defaultValue={[]}>
          {lineItemMetrics.map((item) => (
            <AccordionItem key={item.data.line_item_id} value={item.data.line_item_id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex w-full items-center justify-between gap-3 text-left">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold line-clamp-1">{item.data.line_item_name}</span>
                      <Badge variant="outline" className="text-[11px]">
                        {item.data.buy_type}
                      </Badge>
                      {item.data.fixed_cost_media ? (
                        <Badge variant="secondary" className="text-[11px]">Fixed cost</Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateRange(getBurstDateRange(item.data.bursts))} • Budget{" "}
                      {formatCurrency(item.expected.totals.spend)} •{" "}
                      {getDeliverableLabel(item.data.buy_type)}{" "}
                      {formatNumber(item.expected.totals.deliverables)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      100% = on target | As at {item.pacing.asAtDate ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px] font-medium">
                      {item.pacing.spend
                        ? `Budget ${formatPercent(item.pacing.spend.pacingPct)}`
                        : "Budget —"}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] font-medium">
                      {item.pacing.deliverable
                        ? `Deliverables ${formatPercent(item.pacing.deliverable.pacingPct)}`
                        : "Deliverables —"}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
              <div className="space-y-6">
                <div className="grid gap-3 xl:grid-cols-4 lg:grid-cols-2 auto-rows-[170px]">
                  {item.pacing.spend ? (
                    <div className="flex flex-col">
                      <PacingGaugeCard
                        title="Budget pacing %"
                        pacingPct={item.pacing.spend.pacingPct}
                        actual={formatCurrency(item.pacing.spend.actualToDate)}
                        expected={formatCurrency(item.pacing.spend.expectedToDate)}
                        delta={formatCurrency(item.pacing.spend.delta)}
                        asAt={item.pacing.asAtDate ?? "—"}
                      />
                      <div className="mt-1 text-xs text-muted-foreground px-1">
                        Booked {formatCurrency(item.expected.totals.spend)} • Delivered{" "}
                        {formatCurrency(item.pacing.spend.actualToDate)}
                      </div>
                    </div>
                  ) : (
                    <Card>
                      <KpiHeader title="Budget pacing %" helper="100% = on target" />
                      <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                        Not available for this buy type.
                      </CardContent>
                    </Card>
                  )}
                  {item.pacing.deliverable ? (
                    <div className="flex flex-col">
                      <PacingGaugeCard
                        title="Deliverable pacing %"
                        pacingPct={item.pacing.deliverable.pacingPct}
                        actual={formatNumber(item.pacing.deliverable.actualToDate)}
                        expected={formatNumber(item.pacing.deliverable.expectedToDate)}
                        delta={formatNumber(item.pacing.deliverable.delta)}
                        asAt={item.pacing.asAtDate ?? "—"}
                      />
                      <div className="mt-1 text-xs text-muted-foreground px-1">
                        Booked {formatNumber(item.expected.totals.deliverables)} • Delivered{" "}
                        {formatNumber(item.pacing.deliverable.actualToDate)}
                      </div>
                    </div>
                  ) : (
                    <Card>
                      <KpiHeader title="Deliverable pacing %" helper="100% = on target" />
                      <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                        Not available for this buy type.
                      </CardContent>
                    </Card>
                  )}
                  <FuelGaugeCard
                    title="Budget pacing volume"
                    helper="Actual vs expected to date"
                    summary={item.pacing.spend}
                    asAtDate={item.pacing.asAtDate}
                    valueLabel="Budget"
                    variant="budget"
                  total={item.expected.totals.spend}
                  />
                  <FuelGaugeCard
                    title="Deliverable pacing volume"
                    helper="Actual vs expected to date"
                    summary={item.pacing.deliverable}
                    asAtDate={item.pacing.asAtDate}
                    valueLabel={getDeliverableLabel(item.data.buy_type)}
                    variant="deliverable"
                  total={item.expected.totals.deliverables}
                  />
                </div>

                <Card className="shadow-none border-muted overflow-hidden">
                  <CardHeader className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur pb-4">
                    <CardTitle className="text-base">Daily delivery</CardTitle>
                    <CardDescription className="text-xs">
                      Actual spend and deliverables with KPI rollups.
                    </CardDescription>
                  </CardHeader>
                  <div className="px-6 pt-4">
                    <KpiCallouts totals={summarizeActuals(item.data.actualsDaily)} />
                  </div>
                  <ScrollArea className="max-h-[360px]">
                    <div className="px-6 pb-4 pt-2">
                      <ActualsDailyDeliveryChart
                        series={item.pacing.series}
                        asAtDate={item.pacing.asAtDate}
                        deliverableLabel={getDeliverableLabel(item.data.buy_type)}
                      />
                    </div>
                  </ScrollArea>
                  <div className="sticky bottom-0 z-10 border-t bg-background/95 px-6 py-2 text-xs text-muted-foreground">
                    As at {item.pacing.asAtDate ?? "—"}
                  </div>
                </Card>
              </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Ad set performance</h4>
                      <p className="text-sm text-muted-foreground">
                        Scroll to view all rows. Totals row included.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownloadLineItemCSVs({
                          lineItem: item.data,
                          series: item.pacing.series,
                          totals: summarizeActuals(item.data.actualsDaily),
                        })
                      }
                    >
                      Download CSVs
                    </Button>
                  </div>
                  <AdSetTable rows={item.data.adSetRows} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  )
}

function KpiHeader({
  title,
  helper,
  status,
}: {
  title: string
  helper?: string
  status?: ReactNode
}) {
  return (
    <CardHeader className="pb-2 pt-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium leading-none line-clamp-1">{title}</CardTitle>
          {helper ? (
            <CardDescription className="text-xs text-muted-foreground leading-none line-clamp-1">
              {helper}
            </CardDescription>
          ) : null}
        </div>
        {status ? <div className="flex items-center">{status}</div> : null}
      </div>
    </CardHeader>
  )
}

function FuelGaugeCard({
  title,
  helper,
  summary,
  asAtDate,
  valueLabel,
  variant,
  total,
}: {
  title: string
  helper: string
  summary?: PacingResult["spend"] | PacingResult["deliverable"]
  asAtDate: string | null
  valueLabel: string
  variant: "budget" | "deliverable"
  total?: number
}) {
  if (!summary) {
    return (
      <Card>
        <KpiHeader title={title} helper={helper} />
        <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
          Not available for this buy type.
        </CardContent>
      </Card>
    )
  }

  const baseColor = variant === "deliverable" ? palette.deliverable : palette.budget
  const formatValue = (val: number) =>
    variant === "budget" ? formatCurrency(val) : formatNumber(val)
  const totalValue = Math.max(total ?? 0, 0)
  const delivered = summary.actualToDate
  const actualRatio = totalValue > 0 ? clampRatio(delivered / totalValue) : 0
  const expectedRatio =
    totalValue > 0 ? clampRatio(summary.expectedToDate / totalValue) : 0
  const pacingBandColor =
    summary.pacingPct < 80
      ? palette.error
      : summary.pacingPct < 100
        ? palette.warning
        : palette.success
  const ticks = [0.2, 0.4, 0.6, 0.8]
  const gaugeHeight = 44

  return (
    <Card>
      <KpiHeader title={title} helper={helper} />
      <CardContent className="flex h-[calc(170px-60px)] flex-col justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-3">
                <div className="relative w-full" style={{ height: gaugeHeight }}>
                  <div
                    className="absolute inset-0 rounded-full border"
                    style={{
                      borderColor: "hsl(var(--foreground) / 0.35)",
                      backgroundColor: "hsl(var(--foreground) / 0.04)",
                    }}
                  />
                  <div className="absolute inset-[3px] overflow-hidden rounded-full bg-transparent">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${expectedRatio * 100}%`,
                        backgroundColor: baseColor,
                        opacity: 0.25,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${actualRatio * 100}%`,
                        backgroundColor: baseColor,
                        opacity: 0.9,
                      }}
                    />
                    <div
                      className="absolute top-[16%] bottom-[16%] w-2 rounded-full"
                      style={{
                        left: `${actualRatio * 100}%`,
                        transform: "translateX(-50%)",
                        backgroundColor: pacingBandColor,
                        boxShadow: "0 0 0 1px hsl(var(--background))",
                      }}
                    />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-[2px]"
                    style={{
                      left: `${expectedRatio * 100}%`,
                      backgroundColor: palette.warning,
                      transform: "translateX(-50%)",
                      opacity: 0.95,
                    }}
                  />
                  {ticks.map((tick) => (
                    <div
                      key={tick}
                      className="absolute top-0 h-full border-l border-muted-foreground/30"
                      style={{ left: `${tick * 100}%` }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Delivered</span>
                    <span className="font-medium text-foreground">{formatValue(delivered)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Booked</span>
                    <span className="font-medium text-foreground">{formatValue(totalValue)}</span>
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <ShadTooltipContent className="w-60 text-xs bg-popover border shadow-md">
              <div className="font-semibold">{title}</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual to date</span>
                <span className="font-medium">{formatValue(summary.actualToDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected to date</span>
                <span className="font-medium">{formatValue(summary.expectedToDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta</span>
                <span className="font-medium">{formatValue(summary.delta)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pacing %</span>
                <span className="font-semibold">{formatPercent(summary.pacingPct)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">As at {asAtDate ?? "—"}</div>
            </ShadTooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

function ActualsDailyDeliveryChart({
  series,
  asAtDate,
  deliverableLabel,
}: {
  series: PacingSeriesPoint[]
  asAtDate: string | null
  deliverableLabel: string
}) {
  const chartHeight = 320

  return (
    <ChartContainer
      config={{
        spendActual: { label: "Actual spend", color: palette.budget },
        deliverableActual: {
          label: `${deliverableLabel} actual`,
          color: palette.deliverable,
        },
      }}
      className="w-full h-[320px]"
    >
      <LineChart data={series} height={chartHeight} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
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
          tickFormatter={(v) => formatShortCurrency(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatShortNumber(v)}
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
          strokeWidth={2.3}
          dot={false}
          activeDot={{ r: 4, stroke: palette.deliverable, strokeWidth: 1 }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as PacingSeriesPoint
            return (
              <TooltipContent
                title="Daily delivery"
                date={point.date}
                payload={payload}
                formatter={() => (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Actual spend</span>
                      <span className="font-medium">{formatCurrency(point.actualSpend)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>{deliverableLabel} actual</span>
                      <span className="font-medium">{formatNumber(point.actualDeliverable)}</span>
                    </div>
                    <div className="pt-2 text-[10px] text-muted-foreground">
                      As at {asAtDate ?? "—"}
                    </div>
                  </>
                )}
              />
            )
          }}
        />
      </LineChart>
    </ChartContainer>
  )
}

function TooltipContent({
  title,
  date,
  payload,
  formatter,
}: {
  title: string
  date?: string
  payload?: any
  formatter: (item: any) => ReactNode
}) {
  const item = payload?.[0]
  if (!item) return null

  return (
    <div className="min-w-[240px] rounded-md border bg-popover p-3 shadow-md text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold leading-tight">{title}</div>
        {date ? (
          <div className="text-[11px] text-muted-foreground">{formatDate(date)}</div>
        ) : null}
      </div>
      <div className="space-y-1.5">{formatter(item)}</div>
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

function summarizeActuals(rows: ActualsDaily[]): ActualKpis {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += row.spend
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      acc.results += row.results
      acc.video_3s_views += row.video_3s_views
      return acc
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }
  )

  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cvr = totals.clicks ? (totals.results / totals.clicks) * 100 : 0
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
  const cvr = totals.cvr
  const cpa = totals.cost_per_result
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat
          label="Clicks"
          value={formatNumber(totals.clicks)}
          pill1Label="CTR"
          pill1Value={formatPercent(totals.ctr)}
          pill2Label="CPC"
          pill2Value={formatCurrency(totals.cpc)}
        />
        <KpiStat
          label="Conversions"
          value={formatNumber(totals.results)}
          pill1Label="CVR"
          pill1Value={formatPercent(cvr)}
          pill2Label="CPA"
          pill2Value={formatCurrency(cpa)}
        />
        <KpiStat
          label="Views"
          value={formatNumber(totals.video_3s_views)}
          pill1Label="VR"
          pill1Value={formatPercent(totals.view_rate)}
          pill2Label="CPV"
          pill2Value={formatCurrency(totals.cpv)}
        />
        <KpiStat
          label="Impressions"
          value={formatNumber(totals.impressions)}
          pill1Label="CPM"
          pill1Value={formatShortCurrency(totals.cpm)}
          pill2Label="CTR"
          pill2Value={formatPercent(totals.ctr)}
        />
      </div>
    </div>
  )
}

function KpiStat({
  label,
  value,
  pill1Label,
  pill1Value,
  pill2Label,
  pill2Value,
}: {
  label: string
  value: string
  pill1Label?: string
  pill1Value?: string
  pill2Label?: string
  pill2Value?: string
}) {
  return (
    <div className="rounded-md border border-muted/60 bg-muted/30 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold text-foreground">{value}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {pill1Label ? (
            <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
              {pill1Label} {pill1Value}
            </Badge>
          ) : null}
          {pill2Label ? (
            <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
              {pill2Label} {pill2Value}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AdSetTable({ rows }: { rows: ApiLineItem["adSetRows"] }) {
  const columns =
    "120px 240px 280px 140px 140px 110px 120px 140px 120px 90px 110px 140px 110px 130px"
  const derivedRows: DerivedAdSetRow[] = useMemo(
    () => rows.map((row) => deriveRow(row)),
    [rows]
  )

  const totals = derivedRows.reduce(
    (acc, row) => {
      acc.spend += row.spend
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      acc.results += row.results
      acc.video_3s_views += row.video_3s_views
      return acc
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }
  )

  const totalsDerived = deriveRow({
    date: "Totals",
    ad_set_name: "",
    spend: totals.spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    results: totals.results,
    video_3s_views: totals.video_3s_views,
  })

  return (
    <div className="relative w-full rounded-md border overflow-hidden">
      <div className="bg-muted/50 backdrop-blur border-b">
        <div
          className="grid items-center px-4 py-2 text-xs font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: columns }}
        >
          <div>Date</div>
          <div>Campaign</div>
          <div>Ad Set Name</div>
          <div className="text-right">Amount Spent</div>
          <div className="text-right">Impressions</div>
          <div className="text-right">CPM</div>
          <div className="text-right">Results</div>
          <div className="text-right">Cost Per Result</div>
          <div className="text-right">Clicks</div>
          <div className="text-right">CTR</div>
          <div className="text-right">CPC</div>
          <div className="text-right">3s View Plays</div>
          <div className="text-right">CPV</div>
          <div className="text-right">3s View Rate</div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto">
        {derivedRows.map((row, idx) => (
          <div
            key={`${row.date}-${row.ad_set_name}-${idx}`}
            className="grid items-center border-b last:border-b-0 px-4 py-2 text-sm"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="font-medium">{row.date}</div>
            <div className="truncate">{row.campaign_name}</div>
            <div className="truncate">{row.ad_set_name}</div>
            <div className="text-right">{formatCurrency(row.spend)}</div>
            <div className="text-right">{formatNumber(row.impressions)}</div>
            <div className="text-right">{formatShortCurrency(row.cpm)}</div>
            <div className="text-right">{formatNumber(row.results)}</div>
            <div className="text-right">
              {row.cost_per_result > 0 ? formatCurrency(row.cost_per_result) : "—"}
            </div>
            <div className="text-right">{formatNumber(row.clicks)}</div>
            <div className="text-right">{formatPercent(row.ctr)}</div>
            <div className="text-right">{row.cpc > 0 ? formatCurrency(row.cpc) : "—"}</div>
            <div className="text-right">{formatNumber(row.video_3s_views)}</div>
            <div className="text-right">{row.cpv > 0 ? formatCurrency(row.cpv) : "—"}</div>
            <div className="text-right">{formatPercent(row.view_rate)}</div>
          </div>
        ))}
      </div>

      <div className="bg-muted/60 border-t font-semibold">
        <div
          className="grid items-center px-4 py-2 text-sm"
          style={{ gridTemplateColumns: columns }}
        >
          <div>Totals</div>
          <div />
          <div />
          <div className="text-right">{formatCurrency(totals.spend)}</div>
          <div className="text-right">{formatNumber(totals.impressions)}</div>
          <div className="text-right">{formatShortCurrency(totalsDerived.cpm)}</div>
          <div className="text-right">{formatNumber(totals.results)}</div>
          <div className="text-right">
            {totalsDerived.cost_per_result > 0 ? formatCurrency(totalsDerived.cost_per_result) : "—"}
          </div>
          <div className="text-right">{formatNumber(totals.clicks)}</div>
          <div className="text-right">{formatPercent(totalsDerived.ctr)}</div>
          <div className="text-right">{totalsDerived.cpc > 0 ? formatCurrency(totalsDerived.cpc) : "—"}</div>
          <div className="text-right">{formatNumber(totals.video_3s_views)}</div>
          <div className="text-right">{totalsDerived.cpv > 0 ? formatCurrency(totalsDerived.cpv) : "—"}</div>
          <div className="text-right">{formatPercent(totalsDerived.view_rate)}</div>
        </div>
      </div>
    </div>
  )
}

type DerivedAdSetRow = {
  date: string
  campaign_name: string
  ad_set_name: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
  cpm: number
  ctr: number
  cpc: number
  cost_per_result: number
  cpv: number
  view_rate: number
}

function deriveRow(row: AdSetRow): DerivedAdSetRow {
  const cpm = row.impressions ? (row.spend / row.impressions) * 1000 : 0
  const ctr = row.impressions ? (row.clicks / row.impressions) * 100 : 0
  const cpc = row.clicks ? row.spend / row.clicks : 0
  const cost_per_result = row.results ? row.spend / row.results : 0
  const cpv = row.video_3s_views ? row.spend / row.video_3s_views : 0
  const view_rate = row.impressions
    ? (row.video_3s_views / row.impressions) * 100
    : 0

  return {
    ...row,
    campaign_name: row.campaign_name ?? (row as Record<string, string | undefined>).campaign ?? "",
    cpm,
    ctr,
    cpc,
    cost_per_result,
    cpv,
    view_rate,
  }
}

type CsvFile = {
  filename: string
  data: Record<string, any>[]
}

async function downloadMultipleCSVs(files: CsvFile[]) {
  for (const file of files) {
    downloadCSV(file.data, file.filename)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}

function buildDailySeriesExport(series: PacingSeriesPoint[]) {
  return series.map((point) => ({
    date: point.date,
    actual_spend: point.actualSpend,
    expected_spend: point.expectedSpend,
    actual_deliverable: point.actualDeliverable,
    expected_deliverable: point.expectedDeliverable,
  }))
}

function buildKpiTotalsExport(label: string, totals: ActualKpis) {
  return [
    {
      label,
      spend: totals.spend,
      impressions: totals.impressions,
      clicks: totals.clicks,
      results: totals.results,
      video_3s_views: totals.video_3s_views,
      cpm: totals.cpm,
      ctr: totals.ctr,
      cvr: totals.cvr,
      cpc: totals.cpc,
      cost_per_result: totals.cost_per_result,
      cpv: totals.cpv,
      view_rate: totals.view_rate,
    },
  ]
}

function buildAdSetExport(rows: (AdSetRow & { line_item_name?: string })[]) {
  return rows.map((row) => {
    const derived = deriveRow(row)
    return {
      line_item_name: row.line_item_name ?? "",
      date: derived.date,
      campaign_name: derived.campaign_name,
      ad_set_name: derived.ad_set_name,
      amount_spent: derived.spend,
      impressions: derived.impressions,
      cpm: derived.cpm,
      results: derived.results,
      cost_per_result: derived.cost_per_result,
      clicks: derived.clicks,
      ctr: derived.ctr,
      cpc: derived.cpc,
      view_3s_plays: derived.video_3s_views,
      cpv: derived.cpv,
      view_rate: derived.view_rate,
    }
  })
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
  return cleaned || "meta"
}

async function handleDownloadLineItemCSVs({
  lineItem,
  series,
  totals,
}: {
  lineItem: ApiLineItem
  series: PacingSeriesPoint[]
  totals: ActualKpis
}) {
  const baseName = `meta-${sanitizeFilename(lineItem.line_item_name)}`
  await downloadMultipleCSVs([
    {
      filename: `${baseName}-daily-series`,
      data: buildDailySeriesExport(series),
    },
    {
      filename: `${baseName}-kpi-totals`,
      data: buildKpiTotalsExport(lineItem.line_item_name, totals),
    },
    {
      filename: `${baseName}-ad-sets`,
      data: buildAdSetExport(lineItem.adSetRows),
    },
  ])
}

async function handleDownloadContainerCSVs({
  containerName,
  series,
  totals,
  adSetRows,
}: {
  containerName: string
  series: PacingSeriesPoint[]
  totals: ActualKpis
  adSetRows: (AdSetRow & { line_item_name?: string })[]
}) {
  const baseName = `meta-${sanitizeFilename(containerName)}`
  await downloadMultipleCSVs([
    {
      filename: `${baseName}-daily-series`,
      data: buildDailySeriesExport(series),
    },
    {
      filename: `${baseName}-kpi-totals`,
      data: buildKpiTotalsExport(containerName, totals),
    },
    {
      filename: `${baseName}-ad-sets`,
      data: buildAdSetExport(adSetRows),
    },
  ])
}

function getDeliverableLabel(buyType: BuyType) {
  switch (buyType) {
    case "CPM":
      return "Impressions"
    case "CPC":
      return "Clicks"
    case "CPV":
      return "3s Views"
    case "LEADS":
    case "BONUS":
      return "Results"
    default:
      return "Deliverables"
  }
}

function getBurstDateRange(bursts: Burst[]) {
  let start: string | null = null
  let end: string | null = null

  bursts.forEach((burst) => {
    const burstStart = burst.startDate ?? burst.start_date
    const burstEnd = burst.endDate ?? burst.end_date
    if (burstStart && (!start || burstStart < start)) start = burstStart
    if (burstEnd && (!end || burstEnd > end)) end = burstEnd
  })

  return { start, end }
}

function formatDateRange(range: { start: string | null; end: string | null }) {
  if (!range.start && !range.end) return "Dates unavailable"
  return `${formatDate(range.start)} – ${formatDate(range.end)}`
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatShortCurrency(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return formatCurrency(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatShortNumber(value: number) {
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return formatNumber(value)
}

function formatPercent(value: number) {
  return `${(value || 0).toFixed(1)}%`
}
