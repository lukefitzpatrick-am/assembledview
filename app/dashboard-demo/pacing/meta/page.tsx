"use client"

import { useMemo, type ReactNode } from "react"
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
  AreaChart,
  Area,
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
  BuyType,
  LineItem,
  mockMetaPacing,
} from "@/lib/pacing/mockMetaPacing"

type DerivedAdSetRow = {
  date: string
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

type LineItemWithMetrics = {
  data: LineItem
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

export default function MetaPacingDemoPage() {
  const lineItems = mockMetaPacing.lineItems

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

    lineItemMetrics.forEach((item) => {
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

    const expectedTotals =
      expectedCumulative.length > 0
        ? expectedCumulative[expectedCumulative.length - 1]
        : { cumulative_expected_spend: 0, cumulative_expected_deliverables: 0 }

    const aggregatedExpected = {
      daily: expectedDaily,
      cumulative: expectedCumulative,
      totals: {
        spend: expectedTotals.cumulative_expected_spend,
        deliverables: expectedTotals.cumulative_expected_deliverables,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Meta Social Pacing (Demo)</h1>
          <Badge variant="secondary">Mock Data</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Demo view using mock JSON. Charts mirror the production pacing layout
          and can be swapped to a real API later. 100% = on target.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Container Summary</CardTitle>
          <CardDescription>
            Sum of all Meta line items. Tooltips show actual vs expected, delta,
            pacing %, and as-at date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 xl:grid-cols-4 lg:grid-cols-2 auto-rows-[170px]">
            {containerMetrics.pacing.spend ? (
              <PacingGaugeCard
                title="Budget pacing %"
                pacingPct={containerMetrics.pacing.spend.pacingPct}
                actual={formatCurrency(containerMetrics.pacing.spend.actualToDate)}
                expected={formatCurrency(containerMetrics.pacing.spend.expectedToDate)}
                delta={formatCurrency(containerMetrics.pacing.spend.delta)}
                asAt={containerMetrics.pacing.asAtDate ?? "—"}
              />
            ) : (
              <Card>
                <KpiHeader title="Budget pacing %" helper="100% = on target" />
                <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                  Not available for this buy type.
                </CardContent>
              </Card>
            )}
            {containerMetrics.pacing.deliverable ? (
              <PacingGaugeCard
                title="Deliverable pacing %"
                pacingPct={containerMetrics.pacing.deliverable.pacingPct}
                actual={formatCurrency(containerMetrics.pacing.deliverable.actualToDate)}
                expected={formatCurrency(containerMetrics.pacing.deliverable.expectedToDate)}
                delta={formatCurrency(containerMetrics.pacing.deliverable.delta)}
                asAt={containerMetrics.pacing.asAtDate ?? "—"}
              />
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

          <Card className="shadow-none border-muted">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Daily pacing</CardTitle>
                  <CardDescription className="text-xs">
                    Combined budget and deliverable pacing with dual axes and tooltips.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <DualAxisDailyPacingChart
                series={containerMetrics.pacing.series}
                asAtDate={containerMetrics.pacing.asAtDate}
              />
            </CardContent>
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
                    </div>
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
                {item.data.buy_type === "FIXED COST" ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Charts are hidden for fixed-cost buys. Table remains available.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-3 xl:grid-cols-4 lg:grid-cols-2 auto-rows-[170px]">
                      {item.pacing.spend ? (
                        <PacingGaugeCard
                          title="Budget pacing %"
                          pacingPct={item.pacing.spend.pacingPct}
                          actual={formatCurrency(item.pacing.spend.actualToDate)}
                          expected={formatCurrency(item.pacing.spend.expectedToDate)}
                          delta={formatCurrency(item.pacing.spend.delta)}
                          asAt={item.pacing.asAtDate ?? "—"}
                        />
                      ) : (
                        <Card>
                          <KpiHeader title="Budget pacing %" helper="100% = on target" />
                          <CardContent className="flex h-[calc(170px-60px)] items-center text-sm text-muted-foreground">
                            Not available for this buy type.
                          </CardContent>
                        </Card>
                      )}
                      {item.pacing.deliverable ? (
                        <PacingGaugeCard
                          title="Deliverable pacing %"
                          pacingPct={item.pacing.deliverable.pacingPct}
                          actual={formatCurrency(item.pacing.deliverable.actualToDate)}
                          expected={formatCurrency(item.pacing.deliverable.expectedToDate)}
                          delta={formatCurrency(item.pacing.deliverable.delta)}
                          asAt={item.pacing.asAtDate ?? "—"}
                        />
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

                    <Card className="shadow-none border-muted">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">Daily pacing</CardTitle>
                        <CardDescription className="text-xs">
                          Daily expected vs actual for budget and deliverables.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <DualAxisDailyPacingChart
                          series={item.pacing.series}
                          asAtDate={item.pacing.asAtDate}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Ad set performance</h4>
                      <p className="text-sm text-muted-foreground">
                        Max 10 visible rows before scrolling. Totals row included.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadCSV(item.data)}
                    >
                      Download CSV
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
  const totalValue = Math.max(total ?? summary.expectedToDate, 0)
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
                    {/* expected to-date fill */}
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${expectedRatio * 100}%`,
                        backgroundColor: baseColor,
                        opacity: 0.25,
                      }}
                    />
                    {/* actual to-date fill */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${actualRatio * 100}%`,
                        backgroundColor: baseColor,
                        opacity: 0.9,
                      }}
                    />
                    {/* actual head cap for pacing band color */}
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
                  {/* expected marker */}
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
                    <span>Delivered {valueLabel.toLowerCase()}</span>
                    <span className="font-medium text-foreground">{formatValue(delivered)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Total {valueLabel.toLowerCase()}</span>
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

function DualAxisDailyPacingChart({
  series,
  asAtDate,
}: {
  series: PacingSeriesPoint[]
  asAtDate: string | null
}) {
  const chartHeight = 360

  return (
    <ChartContainer
      config={{
        budgetActual: { label: "Budget actual", color: palette.budget },
        budgetExpected: { label: "Budget expected", color: palette.budget },
        deliverableActual: { label: "Deliverables actual", color: palette.deliverable },
        deliverableExpected: { label: "Deliverables expected", color: palette.deliverable },
      }}
      className="w-full h-[360px]"
    >
      <AreaChart data={series} height={chartHeight} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="budgetActualGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={palette.budget} stopOpacity={0.38} />
            <stop offset="95%" stopColor={palette.budget} stopOpacity={0.24} />
          </linearGradient>
          <linearGradient id="budgetExpectedGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={palette.budget} stopOpacity={0.22} />
            <stop offset="95%" stopColor={palette.budget} stopOpacity={0.16} />
          </linearGradient>
          <linearGradient id="deliverableActualGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={palette.deliverable} stopOpacity={0.36} />
            <stop offset="95%" stopColor={palette.deliverable} stopOpacity={0.22} />
          </linearGradient>
          <linearGradient id="deliverableExpectedGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={palette.deliverable} stopOpacity={0.2} />
            <stop offset="95%" stopColor={palette.deliverable} stopOpacity={0.16} />
          </linearGradient>
        </defs>
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
        <Area
          type="monotone"
          yAxisId="left"
          dataKey="expectedSpend"
          name="Budget expected"
          stroke={palette.budget}
          strokeOpacity={0.9}
          fill="url(#budgetExpectedGradient)"
          fillOpacity={1}
          strokeWidth={1.7}
        />
        <Area
          type="monotone"
          yAxisId="left"
          dataKey="actualSpend"
          name="Budget actual"
          stroke={palette.budget}
          fill="url(#budgetActualGradient)"
          fillOpacity={1}
          strokeWidth={2.8}
          activeDot={{ r: 5, stroke: palette.budget, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          yAxisId="right"
          dataKey="expectedDeliverable"
          name="Deliverables expected"
          stroke={palette.deliverable}
          strokeOpacity={0.9}
          fill="url(#deliverableExpectedGradient)"
          fillOpacity={1}
          strokeWidth={1.6}
        />
        <Area
          type="monotone"
          yAxisId="right"
          dataKey="actualDeliverable"
          name="Deliverables actual"
          stroke={palette.deliverable}
          fill="url(#deliverableActualGradient)"
          fillOpacity={1}
          strokeWidth={2.7}
          activeDot={{ r: 5, stroke: palette.deliverable, strokeWidth: 1 }}
        />
        <ChartTooltip
          content={({ active, payload, label: tooltipLabel }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as PacingSeriesPoint
            const budgetDelta = point.actualSpend - point.expectedSpend
            const budgetPacing =
              point.expectedSpend > 0 ? (point.actualSpend / point.expectedSpend) * 100 : 0
            const deliverableDelta = point.actualDeliverable - point.expectedDeliverable
            const deliverablePacing =
              point.expectedDeliverable > 0
                ? (point.actualDeliverable / point.expectedDeliverable) * 100
                : 0

            return (
              <TooltipContent
                title="Daily pacing"
                payload={payload}
                formatter={() => (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Budget actual</span>
                      <span className="font-medium">{formatCurrency(point.actualSpend)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Budget expected</span>
                      <span className="font-medium">{formatCurrency(point.expectedSpend)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Budget delta</span>
                      <span className="font-medium">{formatCurrency(budgetDelta)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Budget pacing %</span>
                      <span className="font-medium">{formatPercent(budgetPacing)}</span>
                    </div>
                    <div className="pt-1 flex justify-between gap-4">
                      <span>Deliverables actual</span>
                      <span className="font-medium">{formatNumber(point.actualDeliverable)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Deliverables expected</span>
                      <span className="font-medium">{formatNumber(point.expectedDeliverable)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Deliverables delta</span>
                      <span className="font-medium">{formatNumber(deliverableDelta)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Deliverables pacing %</span>
                      <span className="font-medium">{formatPercent(deliverablePacing)}</span>
                    </div>
                    <div className="pt-2 text-[10px] text-muted-foreground">
                      As at {asAtDate ?? tooltipLabel}
                    </div>
                  </>
                )}
              />
            )
          }}
        />
      </AreaChart>
    </ChartContainer>
  )
}

function TooltipContent({
  title,
  payload,
  formatter,
}: {
  title: string
  payload?: any
  formatter: (item: any) => ReactNode
}) {
  const item = payload?.[0]
  if (!item) return null

  return (
    <div className="min-w-[240px] rounded-md border bg-popover p-3 shadow-md text-xs">
      <div className="mb-2 font-semibold leading-tight">{title}</div>
      <div className="space-y-1.5">{formatter(item)}</div>
    </div>
  )
}

function AdSetTable({ rows }: { rows: LineItem["adSetRows"] }) {
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
    <ScrollArea className="w-full rounded-md border">
      <div className="min-w-[1100px]">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead>Ad Set Name</TableHead>
              <TableHead className="text-right">Amount Spent</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">CPM</TableHead>
              <TableHead className="text-right">Results</TableHead>
              <TableHead className="text-right">Cost Per Result</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">3s View Plays</TableHead>
              <TableHead className="text-right">CPV</TableHead>
              <TableHead className="text-right">3s View Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {derivedRows.map((row, idx) => (
              <TableRow key={`${row.date}-${row.ad_set_name}-${idx}`}>
                <TableCell className="font-medium">{row.date}</TableCell>
                <TableCell>{row.ad_set_name}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.spend)}</TableCell>
                <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
                <TableCell className="text-right">{formatShortCurrency(row.cpm)}</TableCell>
                <TableCell className="text-right">{formatNumber(row.results)}</TableCell>
                <TableCell className="text-right">
                  {row.cost_per_result > 0 ? formatCurrency(row.cost_per_result) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
                <TableCell className="text-right">{formatPercent(row.ctr)}</TableCell>
                <TableCell className="text-right">
                  {row.cpc > 0 ? formatCurrency(row.cpc) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatNumber(row.video_3s_views)}</TableCell>
                <TableCell className="text-right">
                  {row.cpv > 0 ? formatCurrency(row.cpv) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatPercent(row.view_rate)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell>Totals</TableCell>
              <TableCell />
              <TableCell className="text-right">{formatCurrency(totals.spend)}</TableCell>
              <TableCell className="text-right">{formatNumber(totals.impressions)}</TableCell>
              <TableCell className="text-right">
                {formatShortCurrency(totalsDerived.cpm)}
              </TableCell>
              <TableCell className="text-right">{formatNumber(totals.results)}</TableCell>
              <TableCell className="text-right">
                {totalsDerived.cost_per_result > 0
                  ? formatCurrency(totalsDerived.cost_per_result)
                  : "—"}
              </TableCell>
              <TableCell className="text-right">{formatNumber(totals.clicks)}</TableCell>
              <TableCell className="text-right">{formatPercent(totalsDerived.ctr)}</TableCell>
              <TableCell className="text-right">
                {totalsDerived.cpc > 0 ? formatCurrency(totalsDerived.cpc) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(totals.video_3s_views)}
              </TableCell>
              <TableCell className="text-right">
                {totalsDerived.cpv > 0 ? formatCurrency(totalsDerived.cpv) : "—"}
              </TableCell>
              <TableCell className="text-right">{formatPercent(totalsDerived.view_rate)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </ScrollArea>
  )
}

function deriveRow(row: {
  date: string
  ad_set_name: string
  spend: number
  impressions: number
  clicks: number
  results: number
  video_3s_views: number
}): DerivedAdSetRow {
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
    cpm,
    ctr,
    cpc,
    cost_per_result,
    cpv,
    view_rate,
  }
}

function handleDownloadCSV(lineItem: LineItem) {
  const derived = lineItem.adSetRows.map((row) => ({
    date: row.date,
    ad_set_name: row.ad_set_name,
    amount_spent: row.spend,
    impressions: row.impressions,
    cpm: row.impressions ? (row.spend / row.impressions) * 1000 : 0,
    results: row.results,
    cost_per_result: row.results ? row.spend / row.results : 0,
    clicks: row.clicks,
    ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
    cpc: row.clicks ? row.spend / row.clicks : 0,
    view_3s_plays: row.video_3s_views,
    cpv: row.video_3s_views ? row.spend / row.video_3s_views : 0,
    view_rate: row.impressions ? (row.video_3s_views / row.impressions) * 100 : 0,
  }))

  downloadCSV(derived, `${lineItem.line_item_name}-ad-sets`)
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
