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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CartesianGrid, XAxis, YAxis, LineChart, Line } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart"
import { SmallProgressCard } from "@/components/dashboard/pacing/SmallProgressCard"
import { SpendChannelCharts, type ChannelSpend, type MonthlySpendByChannel } from "@/components/dashboard/pacing/SpendChannelCharts"
import { MediaPlanViz } from "@/components/dashboard/pacing/MediaPlanViz"
import { downloadCSV } from "@/lib/utils/csv-export"
import { buildMediaChannelColorMap } from "@/lib/media/channelColors"
import { calcExpectedFromBursts } from "@/lib/pacing/calcExpected"
import {
  PacingResult,
  PacingSeriesPoint,
  calculatePacing,
  getDeliverableKey,
} from "@/lib/pacing/calcPacing"
import {
  ActualsDaily,
  LineItem,
  mockMetaPacing,
} from "@/lib/pacing/mockMetaPacing"
import { CHART_PACING as palette } from "@/lib/charts/theme"

// Note: swap mockMetaPacing + mock channel grouping with real Xano + Snowflake joins here later.

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

type MetaBasicAdSetRow = {
  DATE: string
  IMPRESSIONS: number
  INLINE_LINK_CLICKS: number
  REACH: number
  COST_PER_INLINE_LINK_CLICK: number
  CPC: number
  CPM: number
  CTR: number
  FREQUENCY: number
  SPEND: number
  ADSET_NAME: string
  CAMPAIGN_NAME: string
  INLINE_LINK_CLICK_CTR: number
  _FIVETRAN_SYNCED: string
}

type LineItemWithMetrics = {
  data: LineItem
  expected: ReturnType<typeof calcExpectedFromBursts>
  pacing: PacingResult
  performance: ReturnType<typeof aggregateAdSetMetrics>
}

type AggregatedActual = ActualsDaily & { deliverable_value?: number }

const clampRatio = (value: number) => Math.min(Math.max(value, 0), 1)

const InlineChip = ({ label, value }: { label: string; value: string | number }) => (
  <span className="flex items-center gap-1 rounded-full bg-background px-3 py-[6px] text-xs font-medium text-foreground ring-1 ring-muted">
    <span className="text-muted-foreground">{label}:</span>
    <span>{value}</span>
  </span>
)

const CACHE_KEY = "meta-basic-ad-set-cache"
const CACHE_TTL_MS = 10 * 60 * 1000

function formatDateAU(dateString: string) {
  if (!dateString) return "—"
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return dateString
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function getCampaignRange(items: LineItem[]) {
  let start: Date | null = null
  let end: Date | null = null
  items.forEach((item) => {
    item.bursts.forEach((burst) => {
      const s = new Date(burst.start_date)
      const e = new Date(burst.end_date)
      if (!start || s < start) start = s
      if (!end || e > end) end = e
    })
  })
  const fallback = new Date()
  return { start: start ?? fallback, end: end ?? fallback }
}

function getBurstRange(bursts: LineItem["bursts"]) {
  if (!bursts?.length) return { start: "", end: "" }
  const dates = bursts.flatMap((b) => [new Date(b.start_date), new Date(b.end_date)])
  const min = dates.reduce((a, b) => (a < b ? a : b), dates[0])
  const max = dates.reduce((a, b) => (a > b ? a : b), dates[0])
  return { start: min.toISOString(), end: max.toISOString() }
}

function aggregateAdSetMetrics(adSetRows: LineItem["adSetRows"]) {
  const totals = adSetRows?.reduce(
    (acc, row) => {
      acc.spend += row.spend ?? 0
      acc.impressions += row.impressions ?? 0
      acc.clicks += row.clicks ?? 0
      acc.results += row.results ?? 0
      acc.video_3s_views += row.video_3s_views ?? 0
      return acc
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }
  ) ?? { spend: 0, impressions: 0, clicks: 0, results: 0, video_3s_views: 0 }

  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cvr = totals.clicks ? (totals.results / totals.clicks) * 100 : 0
  const cpa = totals.results ? totals.spend / totals.results : 0
  const vr = totals.impressions ? (totals.video_3s_views / totals.impressions) * 100 : 0
  const cpv = totals.video_3s_views ? totals.spend / totals.video_3s_views : 0
  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0

  return { ...totals, ctr, cpc, cvr, cpa, vr, cpv, cpm }
}

async function fetchMetaBasicAdSetRows(bustCache = false): Promise<MetaBasicAdSetRow[]> {
  if (typeof window !== "undefined" && !bustCache) {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { data: MetaBasicAdSetRow[]; ts: number }
      if (Date.now() - parsed.ts < CACHE_TTL_MS) {
        return parsed.data
      }
    }
  }

  const res = await fetch("/api/testing/meta-basic-ad-set?limit=5000")
  if (!res.ok) {
    throw new Error(`Delivery API failed (${res.status})`)
  }
  const json = await res.json()
  const rows = (json?.rows as MetaBasicAdSetRow[]) ?? []

  if (typeof window !== "undefined") {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: rows, ts: Date.now() }))
  }

  return rows
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
        const performance = aggregateAdSetMetrics(item.adSetRows ?? [])
        return { data: item, expected, pacing, performance }
      }),
    [lineItems]
  )

  const campaignRange = useMemo(() => getCampaignRange(lineItems), [lineItems])

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

  const channelAggregates = useMemo(() => {
    const channelData: ChannelSpend[] = [
      { channel: "Social Media", spend: 75588 },
      { channel: "Production", spend: 47211 },
      { channel: "Television", spend: 289990 },
      { channel: "BVOD", spend: 132801 },
      { channel: "Programmatic Video", spend: 30000 },
    ]
    const channelColors = buildMediaChannelColorMap(channelData.map((entry) => entry.channel))

    // Mock monthly distribution proportional to spend with simple spread
    const months = ["Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]
    const monthlyData: MonthlySpendByChannel[] = months.map((month) => {
      const factor =
        month === "Dec 2025"
          ? 0.18
          : month === "Jan 2026"
            ? 0.22
            : month === "Feb 2026"
              ? 0.2
              : month === "Mar 2026"
                ? 0.22
                : 0.18
      const entry: MonthlySpendByChannel = { month }
      channelData.forEach((c) => {
        entry[c.channel] = Number((c.spend * factor).toFixed(0))
      })
      return entry
    })

    return { channelData, monthlyData, channelColors }
  }, [])

  const [deliveryRows, setDeliveryRows] = useState<MetaBasicAdSetRow[]>([])
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setDeliveryLoading(true)
        setDeliveryError(null)
        const rows = await fetchMetaBasicAdSetRows()
        if (!cancelled) setDeliveryRows(rows)
      } catch (err: any) {
        if (!cancelled) setDeliveryError(err?.message ?? "Failed to load delivery data")
      } finally {
        if (!cancelled) setDeliveryLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const spendSummary = containerMetrics.pacing.spend
  const deliverableSummary = containerMetrics.pacing.deliverable
  const totalBudget = containerMetrics.expected.totals.spend
  const totalDeliverables = containerMetrics.expected.totals.deliverables

  const campaignInfo = {
    client: "BIC",
    brand: "BIC - Stationary",
    campaign: "4 Colours FY26",
    mbaNumber: "BICAU001",
    clientContact: "Katarina Marshall",
    planVersion: "v1",
    planDate: "13/01/2026",
    poNumber: "N/A",
    campaignBudget: "$594,048.00",
    campaignStatus: "booked",
    campaignStartDate: "01/12/2025",
    campaignEndDate: "14/04/2026",
  }

  const elapsedInfo = useMemo(() => {
    const start = new Date("2025-12-01")
    const end = new Date("2026-04-14")
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    )
    const today = new Date()
    const elapsedMs = Math.min(end.getTime(), today.getTime()) - start.getTime()
    const elapsedDays = Math.max(0, Math.round(elapsedMs / (1000 * 60 * 60 * 24)))
    return { totalDays, elapsedDays, progress: clampRatio(elapsedDays / totalDays) }
  }, [])

  const spendCard = {
    totalBudgetDisplay: "$594,048",
    expectedSpendDisplay: "$183,336",
    pacingPct: 30.9,
    actualToDate: 183336 * 0.309,
    totalBudgetValue: 594048,
  }

  const socialBudgetCard = {
    actual: 18970,
    expected: 18970 / 1.05,
    total: 50000,
    pacingPct: 105,
  }

  const getScheduleRange = (schedule: Record<string, number>) => {
    const dates = Object.keys(schedule).map((d) => new Date(d))
    const min = dates.reduce((a, b) => (a < b ? a : b), dates[0])
    const max = dates.reduce((a, b) => (a > b ? a : b), dates[0])
    return { start: min.toISOString().slice(0, 10), end: max.toISOString().slice(0, 10) }
  }

  const vizRow = (
    id: string,
    title: string,
    subtitle: string,
    budget: number,
    schedule: Record<string, number>
  ) => {
    const { start, end } = getScheduleRange(schedule)
    return {
      id,
      title,
      subtitle,
      budget,
      start,
      end,
      bursts: [{ id: `${id}-burst`, start, end }],
    }
  }

  const mediaPlanGroups = [
    {
      channel: "TV",
      rows: [
        vizRow("tv-1", '15" First Run TVC (Nine)', "Spots • 18+ • 50 deliverables", 289990, { "2025-12-01": 50 }),
        vizRow("tv-2", "Solus Broadcast Billboards (Premiere & Encore)", "Bonus • 4 deliverables", 0, { "2025-12-01": 4 }),
        vizRow("tv-3", '15" TVCs - $60k Bonus Commitment', "Bonus • 1 deliverable", 0, { "2025-12-01": 1 }),
        vizRow("tv-4", "In-show 4 Colours Pen + BONUS Vivid Marker Integration", "Bonus • 4 deliverables", 0, {
          "2025-12-01": 4,
        }),
      ],
    },
    {
      channel: "BVOD",
      rows: [
        vizRow("bvod-1", "NineNow • 15\" pre & mid rolls", "CPM • 3,055,583 deliverables @ $36", 110001, {
          "2025-12-01": 1018528,
          "2025-12-02": 1018528,
          "2025-12-03": 1018528,
        }),
        vizRow("bvod-2", "TVNZ On Demand • 15\" pre & mid rolls", "CPM • 518,182 deliverables @ $44", 22800, {
          "2025-12-01": 172727,
          "2025-12-02": 172727,
          "2025-12-03": 172727,
        }),
      ],
    },
    {
      channel: "Social",
      rows: [
        vizRow("social-meta", "Meta • Feed & Stories – Static & UGC", "CPM • 5,399,143 deliverables @ $7", 37794, {
          "2025-12-01": 1330000,
          "2025-12-02": 1409143,
          "2025-12-03": 1330000,
          "2025-12-04": 1330000,
        }),
        vizRow("social-tiktok", "TikTok • Feed & Stories – Static & UGC", "CPM • 5,399,143 deliverables @ $7", 37794, {
          "2025-12-01": 1330000,
          "2025-12-02": 1409143,
          "2025-12-03": 1330000,
          "2025-12-04": 1330000,
        }),
      ],
    },
    {
      channel: "YouTube",
      rows: [
        vizRow("yt-dv360", "YouTube DV360 • Completed Views", "CPV • 1,000,000 deliverables", 30000, {
          "2025-12-01": 333333,
          "2025-12-02": 333333,
          "2025-12-03": 333333,
        }),
      ],
    },
  ]

  return (
    <div className="space-y-6 rounded-3xl bg-surface-muted p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Meta Social Pacing (Demo)</h1>
            <Badge variant="secondary">Mock Data</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Demo view using mock JSON. Charts mirror the production pacing layout and can be swapped to a real API
            later. 100% = on target.
          </p>
        </div>
      </header>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelContent standalone className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-[32px] md:text-[38px] font-semibold leading-tight">
                {campaignInfo.campaign}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-muted-foreground">
                <span className="font-medium text-foreground">{campaignInfo.brand}</span>
                <span className="text-muted-foreground/60">•</span>
                <span className="font-medium text-foreground">MBA {campaignInfo.mbaNumber}</span>
                <span className="text-muted-foreground/60">•</span>
                <span className="font-medium text-foreground">{campaignInfo.client}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="rounded-full px-4 py-2 text-[18px] md:text-[20px] font-semibold"
              >
                {campaignInfo.campaignBudget}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full px-4 py-2 text-[18px] md:text-[20px] font-semibold capitalize"
              >
                {campaignInfo.campaignStatus}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border/60 bg-muted/5 px-3 py-2 text-sm md:text-base">
            <InlineChip label="Client Contact" value={campaignInfo.clientContact} />
            <InlineChip label="Plan Version" value={campaignInfo.planVersion} />
            <InlineChip label="Plan Date" value={campaignInfo.planDate} />
            <InlineChip label="PO Number" value={campaignInfo.poNumber} />
          </div>
        </PanelContent>
      </Panel>

      <PanelRow
        title="Campaign progress"
        helperText="Elapsed time in flight and spend vs planned to date for the mock campaign shell."
      >
        <PanelRowCell span="half">
          <SmallProgressCard
            embedded
            label="Campaign time"
            value={`${elapsedInfo.elapsedDays} of ${elapsedInfo.totalDays} days`}
            helper={`${campaignInfo.campaignStartDate} → ${campaignInfo.campaignEndDate} (as of today)`}
            progressRatio={elapsedInfo.progress}
            pacingPct={elapsedInfo.progress * 100}
            accentColor="#4f46e5"
            footer="Elapsed vs total campaign days"
            hideStatus
          />
        </PanelRowCell>
        <PanelRowCell span="half">
          <SmallProgressCard
            embedded
            label="Spend to date"
            value={spendCard.totalBudgetDisplay}
            helper={`Expected ${spendCard.expectedSpendDisplay}`}
            progressRatio={clampRatio(spendCard.actualToDate / spendCard.totalBudgetValue)}
            pacingPct={spendCard.pacingPct}
            accentColor="#4f46e5"
            footer={
              `Pacing ${formatPercent(spendCard.pacingPct)} · Actual ${formatCurrency(spendCard.actualToDate)}`
            }
            hideStatus
          />
        </PanelRowCell>
      </PanelRow>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader className="pb-3">
          <PanelTitle className="text-base">Channel mix</PanelTitle>
          <PanelDescription className="text-sm">
            High-level spend share and monthly pacing by channel (mock aggregates).
          </PanelDescription>
        </PanelHeader>
        <PanelContent>
          <SpendChannelCharts
            embedded
            channelData={channelAggregates.channelData}
            monthlyData={channelAggregates.monthlyData}
            channelColors={channelAggregates.channelColors}
          />
        </PanelContent>
      </Panel>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader className="pb-3">
          <PanelTitle className="text-base">Media plan visualisation</PanelTitle>
          <PanelDescription className="text-sm text-muted-foreground">
            Collapsible view of the media plan by channel.
          </PanelDescription>
        </PanelHeader>
        <PanelContent className="pt-0">
          <Accordion type="single" collapsible defaultValue={undefined}>
            <AccordionItem value="media-plan">
              <AccordionTrigger className="text-sm font-semibold">Channels</AccordionTrigger>
              <AccordionContent>
                <MediaPlanViz groups={mediaPlanGroups} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PanelContent>
      </Panel>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader className="pb-3">
          <PanelTitle className="text-lg">Social delivery</PanelTitle>
          <PanelDescription className="text-sm">
            Delivery and spend overview for Meta (mock). 100% = on track.
          </PanelDescription>
        </PanelHeader>
        <PanelContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Budget and deliverable pacing for the aggregated mock Meta line items.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <SmallProgressCard
              embedded
              label="Budget pacing"
              value={formatCurrency(socialBudgetCard.actual)}
              helper={`Expected ${formatCurrency(socialBudgetCard.expected)}`}
              progressRatio={clampRatio(socialBudgetCard.actual / socialBudgetCard.total)}
              pacingPct={socialBudgetCard.pacingPct}
              accentColor="#4f46e5"
              footer={`Goal ${formatCurrency(socialBudgetCard.total)}`}
            />
            <SmallProgressCard
              embedded
              label="Deliverable pacing"
              value={formatNumber(4_395_525)}
              helper={
                deliverableSummary
                  ? `Expected ${formatNumber(deliverableSummary.expectedToDate)}`
                  : undefined
              }
              progressRatio={clampRatio(4_395_525 / 17_000_000)}
              pacingPct={
                deliverableSummary && deliverableSummary.expectedToDate > 0
                  ? (4_395_525 / deliverableSummary.expectedToDate) * 100
                  : 105
              }
              accentColor="#0ea5e9"
              footer={`Goal ${formatNumber(17_000_000)}`}
            />
          </div>

          <Panel className="border-border/60 bg-muted/5 shadow-none">
            <PanelHeader className="pb-2">
              <PanelTitle className="text-base">Daily delivery</PanelTitle>
              <PanelDescription className="text-xs">
                Actual spend vs impressions delivered per day.
              </PanelDescription>
            </PanelHeader>
            <PanelContent className="pt-2">
              <DualAxisDailyPacingChart
                series={containerMetrics.pacing.series}
                asAtDate={containerMetrics.pacing.asAtDate}
              />
            </PanelContent>
          </Panel>

          <Accordion type="single" collapsible defaultValue={undefined}>
            <AccordionItem value="delivery">
              <AccordionTrigger className="text-base font-semibold">Delivery API</AccordionTrigger>
              <AccordionContent>
                <DeliveryTable
                  rows={deliveryRows}
                  loading={deliveryLoading}
                  error={deliveryError}
                  onRetry={async () => {
                    setDeliveryError(null)
                    setDeliveryLoading(true)
                    try {
                      const rows = await fetchMetaBasicAdSetRows(true)
                      setDeliveryRows(rows)
                    } catch (err: any) {
                      setDeliveryError(err?.message ?? "Failed to load delivery data")
                    } finally {
                      setDeliveryLoading(false)
                    }
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PanelContent>
      </Panel>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader className="pb-3">
          <PanelTitle className="text-xl font-semibold">Line items</PanelTitle>
          <PanelDescription className="text-sm text-muted-foreground">
            Collapsed by default. Each section mirrors the container layout.
          </PanelDescription>
        </PanelHeader>
        <PanelContent className="pt-0">
          <Accordion type="multiple" defaultValue={[]}>
            {lineItemMetrics.map((item) => (
              <AccordionItem key={item.data.line_item_id} value={item.data.line_item_id}>
                <AccordionTrigger className="hover:no-underline rounded-xl px-3 py-2">
                  <div className="flex w-full items-center justify-between gap-3 text-left">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold line-clamp-1">{item.data.line_item_name}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {item.data.buy_type}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                          {(() => {
                            const range = getBurstRange(item.data.bursts)
                            return range.start && range.end
                              ? `${formatDateAU(range.start)} – ${formatDateAU(range.end)}`
                              : "—"
                          })()}
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
                <AccordionContent className="pt-2">
                  {item.data.buy_type === "FIXED COST" ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/5 p-4 text-sm text-muted-foreground">
                      Charts are hidden for fixed-cost buys. Table remains available.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <SmallProgressCard
                          embedded
                          label="Budget pacing"
                          value={item.pacing.spend ? formatCurrency(item.pacing.spend.actualToDate) : "$0"}
                          helper={
                            item.pacing.spend
                              ? `Expected ${formatCurrency(item.pacing.spend.expectedToDate)}`
                              : undefined
                          }
                          progressRatio={
                            item.pacing.spend && item.expected.totals.spend
                              ? clampRatio(item.pacing.spend.actualToDate / item.expected.totals.spend)
                              : 0
                          }
                          pacingPct={item.pacing.spend?.pacingPct}
                          accentColor="#4f46e5"
                          footer={`Goal ${formatCurrency(item.expected.totals.spend)}`}
                        />
                        <SmallProgressCard
                          embedded
                          label="Deliverable pacing"
                          value={
                            item.pacing.deliverable
                              ? formatNumber(item.pacing.deliverable.actualToDate)
                              : "0"
                          }
                          helper={
                            item.pacing.deliverable
                              ? `Expected ${formatNumber(item.pacing.deliverable.expectedToDate)}`
                              : undefined
                          }
                          progressRatio={
                            item.pacing.deliverable && item.expected.totals.deliverables
                              ? clampRatio(
                                  item.pacing.deliverable.actualToDate / item.expected.totals.deliverables
                                )
                              : 0
                          }
                          pacingPct={item.pacing.deliverable?.pacingPct}
                          accentColor="#0ea5e9"
                          footer={`Goal ${formatNumber(item.expected.totals.deliverables)}`}
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCalloutCard
                          title="Clicks"
                          value={formatNumber(item.performance.clicks)}
                          chips={[
                            { label: "CTR", value: formatPercent(item.performance.ctr) },
                            {
                              label: "CPC",
                              value:
                                item.performance.cpc > 0 ? formatCurrency2(item.performance.cpc) : "—",
                            },
                          ]}
                        />
                        <MetricCalloutCard
                          title="Conversions"
                          value={formatNumber(item.performance.results)}
                          chips={[
                            { label: "CVR", value: formatPercent(item.performance.cvr) },
                            {
                              label: "CPA",
                              value:
                                item.performance.cpa > 0 ? formatCurrency2(item.performance.cpa) : "—",
                            },
                          ]}
                        />
                        <MetricCalloutCard
                          title="Views"
                          value={formatNumber(item.performance.video_3s_views)}
                          chips={[
                            { label: "VR", value: formatPercent(item.performance.vr) },
                            {
                              label: "CPV",
                              value:
                                item.performance.cpv > 0 ? formatCurrency2(item.performance.cpv) : "—",
                            },
                          ]}
                        />
                        <MetricCalloutCard
                          title="Impressions"
                          value={formatNumber(item.performance.impressions)}
                          chips={[
                            {
                              label: "CPM",
                              value:
                                item.performance.cpm > 0 ? formatCurrency2(item.performance.cpm) : "—",
                            },
                            { label: "CTR", value: formatPercent(item.performance.ctr) },
                          ]}
                        />
                      </div>

                      <Panel className="border-border/60 bg-muted/5 shadow-none">
                        <PanelHeader className="pb-4">
                          <PanelTitle className="text-base">Daily delivery</PanelTitle>
                          <PanelDescription className="text-xs">
                            Actual spend vs impressions delivered per day.
                          </PanelDescription>
                        </PanelHeader>
                        <PanelContent className="pt-2">
                          <DualAxisDailyPacingChart
                            series={item.pacing.series}
                            asAtDate={item.pacing.asAtDate}
                          />
                        </PanelContent>
                      </Panel>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
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
        </PanelContent>
      </Panel>
    </div>
  )
}

function MetricCalloutCard({
  title,
  value,
  chips,
}: {
  title: string
  value: string
  chips: { label: string; value: string }[]
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="rounded-full border border-muted/60 bg-muted/40 px-2 py-1 font-semibold text-foreground"
            >
              {chip.label} {chip.value}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[28px] font-semibold leading-tight text-foreground">{value}</div>
    </div>
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
        budgetActual: { label: "Spend", color: palette.budget },
        deliverableActual: { label: "Impressions", color: palette.deliverable },
      }}
      className="w-full h-[360px]"
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
          name="Spend"
          stroke={palette.budget}
          strokeWidth={2.4}
          dot={false}
          cursor="default"
          activeDot={{ r: 5, stroke: palette.budget, strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          yAxisId="right"
          dataKey="actualDeliverable"
          name="Impressions"
          stroke={palette.deliverable}
          strokeWidth={2.4}
          dot={false}
          cursor="default"
          activeDot={{ r: 5, stroke: palette.deliverable, strokeWidth: 1 }}
        />
        <ChartTooltip
          content={({ active, payload, label: tooltipLabel }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as PacingSeriesPoint
            const dateLabel = point.date ? formatDateAU(point.date) : tooltipLabel
            return (
              <TooltipContent
                title="Daily delivery"
                date={dateLabel}
                payload={payload}
                formatter={() => (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Spend</span>
                      <span className="font-medium">{formatCurrency(point.actualSpend)}</span>
                    </div>
                    <div className="pt-1 flex justify-between gap-4">
                      <span>Impressions</span>
                      <span className="font-medium">{formatNumber(point.actualDeliverable)}</span>
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
    <div className="min-w-[240px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold leading-tight">{title}</div>
        {date ? <div className="text-[11px] text-muted-foreground">{date}</div> : null}
      </div>
      <div className="space-y-1.5">{formatter(item)}</div>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1 rounded-xl border border-muted/60 bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

function DeliveryTable({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: MetaBasicAdSetRow[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(b.DATE).getTime() - new Date(a.DATE).getTime()
      ),
    [rows]
  )

  const totals = useMemo(() => {
    const agg = sortedRows.reduce(
      (acc, row) => {
        acc.impressions += row.IMPRESSIONS ?? 0
        acc.clicks += row.INLINE_LINK_CLICKS ?? 0
        acc.reach += row.REACH ?? 0
        acc.spend += row.SPEND ?? 0
        return acc
      },
      { impressions: 0, clicks: 0, reach: 0, spend: 0 }
    )
    const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0
    const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0
    const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0
    const frequency = agg.reach > 0 ? agg.impressions / agg.reach : 0
    const inlineCtr = ctr
    const costPerInline = agg.clicks > 0 ? agg.spend / agg.clicks : 0
    return { ...agg, cpc, cpm, ctr, frequency, inlineCtr, costPerInline }
  }, [sortedRows])

  const handleDownload = () => {
    downloadCSV(sortedRows, "meta-basic-ad-set")
  }

  return (
    <Panel className="border-border/60 bg-muted/5 shadow-none">
      <PanelHeader className="pb-2">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <PanelTitle className="text-base">Delivery (API)</PanelTitle>
            <PanelDescription className="text-xs">Latest rows from /api/testing/meta-basic-ad-set</PanelDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleDownload}
            disabled={loading || !sortedRows.length}
          >
            Download CSV
          </Button>
        </div>
      </PanelHeader>
      <PanelContent className="pt-2">
        {error ? (
          <div
            role="alert"
            className="mb-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <div className="text-sm text-destructive">{error}</div>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading delivery data…</div>
        ) : (
          <ScrollArea className="h-[420px] w-full rounded-lg border border-border">
            <div className="min-w-[1150px]">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Inline Link Clicks</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Cost / Inline Link Click</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">CPM</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Frequency</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead>Ad Set</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Inline Link Click CTR</TableHead>
                    <TableHead className="text-right">_FIVETRAN_SYNCED</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="relative">
                  {sortedRows.map((row, idx) => (
                    <TableRow key={`${row.DATE}-${row.ADSET_NAME}-${idx}`}>
                      <TableCell className="font-medium">{formatDateAU(row.DATE)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.IMPRESSIONS)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.INLINE_LINK_CLICKS)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.REACH)}</TableCell>
                      <TableCell className="text-right">
                        {row.COST_PER_INLINE_LINK_CLICK ? formatCurrency2(row.COST_PER_INLINE_LINK_CLICK) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{row.CPC ? formatCurrency2(row.CPC) : "—"}</TableCell>
                      <TableCell className="text-right">{row.CPM ? formatCurrency2(row.CPM) : "—"}</TableCell>
                      <TableCell className="text-right">{formatPercent(row.CTR)}</TableCell>
                      <TableCell className="text-right">{row.FREQUENCY?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency2(row.SPEND)}</TableCell>
                      <TableCell>{row.ADSET_NAME}</TableCell>
                      <TableCell>{row.CAMPAIGN_NAME}</TableCell>
                      <TableCell className="text-right">{formatPercent(row.INLINE_LINK_CLICK_CTR)}</TableCell>
                      <TableCell className="text-right">{formatDateAU(row._FIVETRAN_SYNCED)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="sticky bottom-0 z-20 bg-card/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur font-semibold">
                    <TableCell>Totals</TableCell>
                    <TableCell className="text-right">{formatNumber(totals.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(totals.clicks)}</TableCell>
                    <TableCell className="text-right">{formatNumber(totals.reach)}</TableCell>
                    <TableCell className="text-right">
                      {totals.costPerInline ? formatCurrency2(totals.costPerInline) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{totals.cpc ? formatCurrency2(totals.cpc) : "—"}</TableCell>
                    <TableCell className="text-right">{totals.cpm ? formatCurrency2(totals.cpm) : "—"}</TableCell>
                    <TableCell className="text-right">{formatPercent(totals.ctr)}</TableCell>
                    <TableCell className="text-right">{totals.frequency ? totals.frequency.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency2(totals.spend)}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right">{formatPercent(totals.inlineCtr)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </PanelContent>
    </Panel>
  )
}

function AdSetTable({ rows }: { rows: LineItem["adSetRows"] }) {
  const derivedRows: DerivedAdSetRow[] = useMemo(
    () =>
      rows
        .map((row) => deriveRow(row))
        .sort((a, b) => {
          const aDate = new Date(a.date).getTime()
          const bDate = new Date(b.date).getTime()
          if (Number.isNaN(aDate) || Number.isNaN(bDate)) return 0
          return bDate - aDate
        }),
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
    <ScrollArea className="w-full rounded-lg border border-border">
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
                <TableCell className="font-medium">{formatDateAU(row.date)}</TableCell>
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
    date: formatDateAU(row.date),
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatCurrency2(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  const num = Number(value)
  if (Number.isNaN(num)) return "0.0%"
  return `${num.toFixed(1)}%`
}
