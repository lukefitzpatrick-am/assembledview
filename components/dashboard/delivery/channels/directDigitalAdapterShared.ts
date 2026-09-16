import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { formatMoney } from "@/lib/format/money"
import { getLineItemKpiRow } from "@/lib/kpi/lineItemKpiTargets"
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget"
import type { CampaignKPI } from "@/lib/kpi/types"
import { inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { sumReportedSpend } from "@/lib/delivery/programmatic/applyReportedSpend"
import type { ProgressCardProps } from "../shared/ProgressCard"
import type { KpiTileProps } from "../shared/KpiTile"
import type { LineItemBlockProps } from "../shared/LineItemBlock"
import type { EntityBreakdownRow } from "../shared/EntityBreakdownTable"
import type { DeliveryStatus } from "../shared/statusColours"
import type { ChannelKey, ChannelSectionData } from "./types"
import { aggregateDailyRows } from "./aggregateDaily"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"

const FIXED_COST_SPEND_LABEL = "Reported spend (fixed cost)"
const CM360_NO_SPEND_CONNECTION =
  "Ad server verification (CM360) — delivery counts, no spend data"

type AdServingLineItem = {
  line_item_id?: string
  lineItemId?: string
  LINE_ITEM_ID?: string
  line_item_name?: string
  lineItemName?: string
  buy_type?: string
  platform?: string
  bursts?: unknown
  bursts_json?: unknown
  fixedCostMedia?: boolean
  fixed_cost_media?: boolean
  totalMedia?: unknown
  grossMedia?: unknown
  budget?: unknown
  spend?: unknown
  investment?: unknown
  media_investment?: unknown
}

type DailyActuals = {
  date: string
  impressions: number
  clicks: number
  results: number
  videoCompletes: number
}

function cleanId(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

function extractLineItemId(item: AdServingLineItem): string | null {
  return cleanId(item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID)
}

type PlacementFactRow = {
  entityId?: string | null
  entityName?: string | null
  impressions?: number
  clicks?: number
  results?: number
  video3sViews?: number
}

/** Group CM360 fact rows by placement entityId. Blank ids are dropped, not "unknown". */
export function groupPacingRowsByPlacement(rows: PlacementFactRow[]): EntityBreakdownRow[] {
  type Acc = {
    id: string
    name: string
    impressions: number
    clicks: number
    results: number
    videoCompletes: number
  }
  const byId = new Map<string, Acc>()
  for (const row of rows) {
    const rawId = String(row.entityId ?? "").trim()
    const id = rawId.toLowerCase()
    if (!id) continue
    const nextName = String(row.entityName ?? "").trim()
    const existing = byId.get(id)
    const impressions = Number(row.impressions ?? 0) || 0
    const clicks = Number(row.clicks ?? 0) || 0
    const results = Number(row.results ?? 0) || 0
    const videoCompletes = Number(row.video3sViews ?? 0) || 0
    if (!existing) {
      byId.set(id, {
        id,
        name: nextName,
        impressions,
        clicks,
        results,
        videoCompletes,
      })
    } else {
      existing.impressions += impressions
      existing.clicks += clicks
      existing.results += results
      existing.videoCompletes += videoCompletes
      if (!existing.name && nextName) existing.name = nextName
    }
  }
  return [...byId.values()].map((acc) => ({
    id: acc.id,
    name: acc.name || acc.id,
    impressions: acc.impressions,
    clicks: acc.clicks,
    videoCompletes: acc.videoCompletes,
  }))
}

function parseBursts(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((b) => b && typeof b === "object") as Array<Record<string, unknown>>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? (parsed.filter((b) => b && typeof b === "object") as Array<Record<string, unknown>>)
        : []
    } catch {
      return []
    }
  }
  return []
}

function burstDeliverables(burst: Record<string, unknown>): number {
  const raw = burst.calculatedValue ?? burst.calculated_value ?? burst.calculated_value_number ?? burst.deliverables
  const n = typeof raw === "number" ? raw : Number(String(raw ?? ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function moneyish(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function isFixedCostMedia(item: AdServingLineItem): boolean {
  return item.fixedCostMedia === true || item.fixed_cost_media === true
}

function bookedSpend(item: AdServingLineItem): number {
  const rec = item as Record<string, unknown>
  const n = moneyish(
    rec.totalMedia ?? rec.grossMedia ?? rec.budget ?? rec.spend ?? rec.investment ?? rec.media_investment,
  )
  if (n > 0) return n
  return parseBursts(item.bursts_json ?? item.bursts).reduce(
    (sum, burst) =>
      sum + moneyish(burst.budget ?? burst.media_amount ?? burst.mediaAmount ?? burst.totalMedia),
    0,
  )
}

/** Plan deliverable totals by buy type — impressions for CPM, clicks for CPC. */
function bookedDeliverables(item: AdServingLineItem): { impressions: number; clicks: number } {
  const buy = String(item.buy_type ?? "")
    .trim()
    .toLowerCase()
  const bursts = parseBursts(item.bursts_json ?? item.bursts)
  const total = bursts.reduce((sum, b) => sum + burstDeliverables(b), 0)
  if (buy === "cpc" || buy === "cpa" || buy === "cpl") {
    return { impressions: 0, clicks: total }
  }
  return { impressions: total, clicks: 0 }
}

function formatWholeNumber(value: number | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-AU")
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return "0.00%"
  return `${x.toFixed(2)}%`
}

function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0
  return num / den
}

/** Video completion rate in 0-100 percentage points. ComboChart's
 *  "percent" format divides by 100 when the value exceeds 1. */
function completionRatePct(videoCompletes: number, impressions: number): number {
  return safeDiv(videoCompletes, impressions) * 100
}

function pctVarianceFromPacingPct(pct: number | undefined): number {
  if (pct === undefined || Number.isNaN(pct)) return 0
  return (pct - 100) / 100
}

function deliveryProgressCard(input: {
  title: string
  actual: number
  planned: number
  sparkline: number[]
  dense?: boolean
}): ProgressCardProps {
  const { title, actual, planned, sparkline, dense } = input
  const hasGoal = planned > 0
  const progress = hasGoal ? Math.max(0, Math.min(1, safeDiv(actual, planned))) : 0
  const pacingPct = hasGoal ? safeDiv(actual, planned) * 100 : undefined
  return {
    title,
    value: formatWholeNumber(actual),
    detail: hasGoal
      ? `Delivered ${formatWholeNumber(actual)} · Planned ${formatWholeNumber(planned)}`
      : `Delivered ${formatWholeNumber(actual)} · No plan goal`,
    progress,
    variance: hasGoal ? pctVarianceFromPacingPct(pacingPct) : 0,
    varianceLabel: hasGoal ? "vs plan deliverable" : "verification counts only",
    status: hasGoal ? deliveryStatusFromPct(pacingPct) : "no-data",
    sparkline,
    dense,
  }
}

function burstPlannedSpend(burst: { mediaAmount?: number; budget: number }): number {
  return burst.mediaAmount && burst.mediaAmount > 0 ? burst.mediaAmount : burst.budget
}

/** Planned × inclusive elapsed share of the line's bursts. Null when there are no bursts. */
function expectedSpendToDateFromBursts(
  rawBursts: unknown,
  planned: number,
  asOfDate: string,
): number | null {
  const bursts = parseBurstsToNormalised(rawBursts)
  if (bursts.length === 0) return null

  let expected = 0
  let burstMoney = 0
  for (const burst of bursts) {
    const totalDays = inclusiveDaysBetween(burst.startDate, burst.endDate)
    if (!totalDays) continue
    const amount = burstPlannedSpend(burst)
    burstMoney += amount
    if (asOfDate < burst.startDate) continue
    const windowEnd = asOfDate > burst.endDate ? burst.endDate : asOfDate
    const elapsed = inclusiveDaysBetween(burst.startDate, windowEnd)
    if (!elapsed) continue
    expected += amount * Math.min(1, Math.max(0, elapsed / totalDays))
  }
  if (burstMoney > 0) return expected

  const start = bursts[0]!.startDate
  const end = bursts.reduce((latest, burst) => (burst.endDate > latest ? burst.endDate : latest), bursts[0]!.endDate)
  const totalDays = inclusiveDaysBetween(start, end)
  if (!totalDays || planned <= 0) return null
  if (asOfDate < start) return 0
  const windowEnd = asOfDate > end ? end : asOfDate
  const elapsed = inclusiveDaysBetween(start, windowEnd)
  if (!elapsed) return null
  return planned * Math.min(1, Math.max(0, elapsed / totalDays))
}

function spendDeliveryProgressCard(input: {
  title: string
  actual: number
  planned: number
  expectedToDate?: number | null
  sparkline: number[]
  dense?: boolean
}): ProgressCardProps {
  const { title, actual, planned, expectedToDate, sparkline, dense } = input
  const hasGoal = planned > 0
  const hasExpected = expectedToDate != null && expectedToDate > 0
  const progress = hasGoal ? Math.max(0, Math.min(1, safeDiv(actual, planned))) : 0
  const pacingPct = hasExpected
    ? safeDiv(actual, expectedToDate) * 100
    : hasGoal
      ? safeDiv(actual, planned) * 100
      : undefined
  return {
    title,
    value: formatMoney(actual),
    detail: hasExpected
      ? `Reported ${formatMoney(actual)} · Planned ${formatMoney(planned)} · Expected to date ${formatMoney(expectedToDate)}`
      : hasGoal
        ? `Delivered ${formatMoney(actual)} · Planned ${formatMoney(planned)}`
        : `Delivered ${formatMoney(actual)} · No plan goal`,
    progress,
    variance: pacingPct != null ? pctVarianceFromPacingPct(pacingPct) : 0,
    varianceLabel: hasExpected ? "vs expected to date" : hasGoal ? "vs plan spend" : "reported spend",
    status: pacingPct != null ? deliveryStatusFromPct(pacingPct) : "no-data",
    sparkline,
    dense,
  }
}

function normalizeAdServingLineItems(items: unknown[] | undefined): AdServingLineItem[] {
  const arr = Array.isArray(items) ? items : []
  return arr.flatMap((item) => {
    const typed = item as AdServingLineItem
    const id = extractLineItemId(typed)
    if (!id) return []
    return [{ ...typed, line_item_id: id }]
  })
}

/**
 * Direct Booked Digital (CM360 verification). ZERO-$ LAW: never surfaces
 * platform spend. Fixed-cost lines overlay REPORTED_SPEND from
 * FIXED_COST_REPORTED_DAILY_FACT when `reportedSpendByLineDate` has entries.
 */
export function buildDirectDigitalChannelSection(input: {
  key: ChannelKey
  title: string
  lineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  filterRange: DateRange
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  brandColour?: string
  lastSyncedAt: Date | null
  reportedSpendByLineDate?: Map<string, Map<string, number>>
  /** Melbourne civil date for expected-to-date; defaults to today. */
  asOfDate?: string
}): ChannelSectionData | null {
  const {
    key,
    title,
    lineItems,
    combinedRows,
    campaignStart,
    campaignEnd,
    mbaNumber,
    kpiVersionNumber,
    lineItemTargets,
    brandColour,
    lastSyncedAt,
    reportedSpendByLineDate,
    asOfDate,
  } = input
  // filterRange reserved for future date-window clipping (parity with other adapters)
  void input.filterRange

  const normalized = normalizeAdServingLineItems(lineItems)
  if (!normalized.length) return null

  const idSet = new Set(normalized.map((i) => i.line_item_id!).filter(Boolean))
  const knownPlanLineIds = Array.from(idSet)
  // Snowflake PACING_FACT channel is still "ad-serving" (Ad Serving - CM360) for
  // every Direct Booked Digital media type — not the container ChannelKey.
  const adRows = combinedRows.filter(
    (r) => r.channel === "ad-serving" && r.lineItemId && idSet.has(String(r.lineItemId).toLowerCase()),
  )
  // No CM360 verification rows for these plan ids → hide the block entirely.
  if (!adRows.length) return null

  const asAtISO = asOfDate || getMelbourneTodayISO()
  // Channel chrome uses media-type colour; brandColour stays on chart props only (AVU5-4).
  const mediaTypeColour = channelMediaTypeColour(key)
  const accentColour = mediaTypeColour

  const metrics = normalized.map((item) => {
    const id = item.line_item_id!
    const matched = adRows.filter((r) => String(r.lineItemId).toLowerCase() === id)
    const byDate = new Map<string, DailyActuals>()
    for (const row of matched) {
      const date = String(row.dateDay ?? "").slice(0, 10)
      if (!date) continue
      const existing = byDate.get(date) ?? {
        date,
        impressions: 0,
        clicks: 0,
        results: 0,
        videoCompletes: 0,
      }
      byDate.set(date, {
        date,
        impressions: existing.impressions + Number(row.impressions ?? 0),
        clicks: existing.clicks + Number(row.clicks ?? 0),
        results: existing.results + Number(row.results ?? 0),
        videoCompletes: existing.videoCompletes + Number(row.video3sViews ?? 0),
      })
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
    const totals = daily.reduce(
      (acc, d) => ({
        impressions: acc.impressions + d.impressions,
        clicks: acc.clicks + d.clicks,
        results: acc.results + d.results,
        videoCompletes: acc.videoCompletes + d.videoCompletes,
      }),
      { impressions: 0, clicks: 0, results: 0, videoCompletes: 0 },
    )
    const booked = bookedDeliverables(item)
    const spendPlanned = bookedSpend(item)
    const reportedByDate = isFixedCostMedia(item) ? reportedSpendByLineDate?.get(id) : undefined
    const hasReportedEntries = Boolean(reportedByDate && reportedByDate.size > 0)
    return {
      item,
      id,
      daily,
      totals,
      booked,
      bookedSpend: spendPlanned,
      expectedSpendToDate: expectedSpendToDateFromBursts(
        item.bursts_json ?? item.bursts,
        spendPlanned,
        asAtISO,
      ),
      matched,
      hasReportedEntries,
      reportedTotal: hasReportedEntries ? sumReportedSpend(reportedByDate) : 0,
      reportedByDate,
    }
  })

  // Drop plan-only orphans with zero matched rows from the accordion; keep aggregate from matched.
  const withDelivery = metrics.filter((m) => m.daily.length > 0)
  if (!withDelivery.length) return null

  const rollup = withDelivery.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.totals.impressions,
      clicks: acc.clicks + m.totals.clicks,
      results: acc.results + m.totals.results,
      videoCompletes: acc.videoCompletes + m.totals.videoCompletes,
      plannedImpressions: acc.plannedImpressions + m.booked.impressions,
      plannedClicks: acc.plannedClicks + m.booked.clicks,
    }),
    {
      impressions: 0,
      clicks: 0,
      results: 0,
      videoCompletes: 0,
      plannedImpressions: 0,
      plannedClicks: 0,
    },
  )

  const hasVideoCompletes = rollup.videoCompletes > 0
  const dailyChartSeries = [
    { key: "impressions", label: "Impressions", yAxis: "left" as const, format: "number" as const },
    hasVideoCompletes
      ? { key: "completionRate", label: "Completion rate", yAxis: "right" as const, format: "percent" as const }
      : { key: "clicks", label: "Clicks", yAxis: "right" as const, format: "number" as const },
  ]

  const ctr = safeDiv(rollup.clicks, rollup.impressions) * 100

  const ctrTargetRaw = (() => {
    const rows = withDelivery
      .map((m) => getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id))
      .filter(Boolean) as CampaignKPI[]
    if (!rows.length) return undefined
    const first = rows[0]?.ctr
    if (first == null || first <= 0) return undefined
    if (!rows.every((r) => r.ctr === first)) return undefined
    return ratioTargetPercentPoints(first)
  })()

  const aggregateKpiTiles: KpiTileProps[] = [
    {
      label: "Served impressions",
      value: formatWholeNumber(rollup.impressions),
      accentColour,
    },
    {
      label: "Clicks",
      value: formatWholeNumber(rollup.clicks),
      accentColour,
    },
    {
      label: "CTR",
      value: fmtPct(ctr),
      expected: ctrTargetRaw != null ? fmtPct(ctrTargetRaw) : undefined,
      status:
        ctrTargetRaw != null && ctrTargetRaw > 0
          ? deliveryStatusFromPct(safeDiv(ctr, ctrTargetRaw) * 100)
          : "no-data",
      accentColour,
    },
    {
      label: "Video completes",
      value: formatWholeNumber(rollup.videoCompletes),
      accentColour,
    },
    ...(hasVideoCompletes
      ? [
          {
            label: "Completion rate",
            value: fmtPct(completionRatePct(rollup.videoCompletes, rollup.impressions)),
            accentColour,
          },
        ]
      : []),
    {
      label: "Results",
      value: formatWholeNumber(rollup.results),
      accentColour,
    },
  ]

  const aggDaily = aggregateDailyRows(
    withDelivery.flatMap((m) =>
      m.daily.map((d) => ({
        date: d.date,
        impressions: d.impressions,
        clicks: d.clicks,
        videoCompletes: d.videoCompletes,
      })),
    ),
    ["impressions", "clicks", "videoCompletes"],
  )

  const impressionsSpark = aggDaily.map((d) => Number(d.impressions ?? 0))
  const clicksSpark = aggDaily.map((d) => Number(d.clicks ?? 0))

  const impressionsCard = deliveryProgressCard({
    title: "Impressions delivery",
    actual: rollup.impressions,
    planned: rollup.plannedImpressions,
    sparkline: impressionsSpark,
  })
  const clicksCard = deliveryProgressCard({
    title: "Clicks delivery",
    actual: rollup.clicks,
    planned: rollup.plannedClicks,
    sparkline: clicksSpark,
  })
  const reportedLines = withDelivery.filter((m) => m.hasReportedEntries)
  const reportedSpendTotal = reportedLines.reduce((sum, m) => sum + m.reportedTotal, 0)
  const reportedSpendPlanned = reportedLines.reduce((sum, m) => sum + m.bookedSpend, 0)
  const reportedSpendSpark = aggDaily.map((d) => {
    const date = String(d.date ?? "")
    return reportedLines.reduce((sum, m) => sum + (m.reportedByDate?.get(date) ?? 0), 0)
  })
  const reportedExpectedToDate = reportedLines.every((m) => m.expectedSpendToDate != null)
    ? reportedLines.reduce((sum, m) => sum + (m.expectedSpendToDate ?? 0), 0)
    : null
  const spendCard =
    reportedLines.length > 0
      ? spendDeliveryProgressCard({
          title: FIXED_COST_SPEND_LABEL,
          actual: reportedSpendTotal,
          planned: reportedSpendPlanned,
          expectedToDate: reportedExpectedToDate,
          sparkline: reportedSpendSpark,
        })
      : null
  const aggregateProgressCards: [ProgressCardProps, ProgressCardProps] = spendCard
    ? [spendCard, impressionsCard]
    : [impressionsCard, clicksCard]

  const accordionItems = withDelivery.map((m) => {
    const liCtr = safeDiv(m.totals.clicks, m.totals.impressions) * 100
    const kpiRow = getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id)
    const liCtrTarget = ratioTargetPercentPoints(kpiRow?.ctr)

    const dailyRows = m.daily.map((d) => ({
      date: d.date,
      impressions: Number(d.impressions ?? 0),
      ...(hasVideoCompletes
        ? { completionRate: completionRatePct(Number(d.videoCompletes ?? 0), Number(d.impressions ?? 0)) }
        : { clicks: Number(d.clicks ?? 0) }),
    }))

    const displayName = deliveryLineItemDisplayName(m.item as Record<string, unknown>)
    const placementRows = groupPacingRowsByPlacement(m.matched)
    const impressionCard = deliveryProgressCard({
      title: "Impressions delivery",
      actual: m.totals.impressions,
      planned: m.booked.impressions,
      sparkline: m.daily.map((d) => d.impressions),
      dense: true,
    })
    const clicksCard = deliveryProgressCard({
      title: "Clicks delivery",
      actual: m.totals.clicks,
      planned: m.booked.clicks,
      sparkline: m.daily.map((d) => d.clicks),
      dense: true,
    })
    const lineSpendCard = m.hasReportedEntries
      ? spendDeliveryProgressCard({
          title: FIXED_COST_SPEND_LABEL,
          actual: m.reportedTotal,
          planned: m.bookedSpend,
          expectedToDate: m.expectedSpendToDate,
          sparkline: m.daily.map((d) => m.reportedByDate?.get(d.date) ?? 0),
          dense: true,
        })
      : null
    const block: LineItemBlockProps = {
      name: displayName.label,
      fullName: displayName.full,
      platform: String(m.item.buy_type ?? m.item.platform ?? "CM360"),
      progressCards: lineSpendCard ? [lineSpendCard, impressionCard] : [impressionCard, clicksCard],
      kpiBand: {
        title: "Verification KPIs",
        tiles: [
          {
            label: "Served impressions",
            value: formatWholeNumber(m.totals.impressions),
            accentColour,
          },
          {
            label: "Clicks",
            value: formatWholeNumber(m.totals.clicks),
            accentColour,
          },
          {
            label: "CTR",
            value: fmtPct(liCtr),
            expected: liCtrTarget != null ? fmtPct(liCtrTarget) : undefined,
            status:
              liCtrTarget != null && liCtrTarget > 0
                ? deliveryStatusFromPct(safeDiv(liCtr, liCtrTarget) * 100)
                : "no-data",
            accentColour,
          },
          {
            label: "Video completes",
            value: formatWholeNumber(m.totals.videoCompletes),
            accentColour,
          },
          ...(hasVideoCompletes
            ? [
                {
                  label: "Completion rate",
                  value: fmtPct(completionRatePct(m.totals.videoCompletes, m.totals.impressions)),
                  accentColour,
                },
              ]
            : []),
          {
            label: "Results",
            value: formatWholeNumber(m.totals.results),
            accentColour,
          },
        ],
      },
      chart: {
        kind: "daily-delivery",
        daily: dailyRows,
        series: dailyChartSeries,
        asAtDate: asAtISO,
        brandColour: input.brandColour,
      },
      ...(placementRows.length > 0
        ? {
            entityBreakdown: {
              rows: placementRows,
              knownPlanLineIds,
              entityNoun: { singular: "placement", plural: "placements" },
              columns: "delivery" as const,
            },
          }
        : {}),
    }

    return { id: m.id, block }
  })

  return {
    key,
    title,
    dateRange: { startISO: input.campaignStart, endISO: input.campaignEnd },
    lastSyncedAt: input.lastSyncedAt,
    connections: [
      {
        label: CM360_NO_SPEND_CONNECTION,
        tone: "cm360",
      },
    ],
    mediaTypeColour,
    aggregate: {
      summaryChips: [
        ...(spendCard ? [{ label: FIXED_COST_SPEND_LABEL, value: formatMoney(reportedSpendTotal) }] : []),
        { label: "Served impressions", value: formatWholeNumber(rollup.impressions) },
        { label: "Clicks", value: formatWholeNumber(rollup.clicks) },
        { label: "CTR", value: fmtPct(ctr) },
        { label: "Video completes", value: formatWholeNumber(rollup.videoCompletes) },
        ...(hasVideoCompletes
          ? [
              {
                label: "Completion rate",
                value: fmtPct(completionRatePct(rollup.videoCompletes, rollup.impressions)),
              },
            ]
          : []),
      ],
      progressCards: aggregateProgressCards,
      kpiBand: {
        title: "Verification KPIs",
        subtitle: "CM360 delivery counts — spend not applicable",
        tiles: aggregateKpiTiles,
      },
      chart: {
        daily: aggDaily.map((d) => ({
          date: d.date,
          impressions: Number(d.impressions ?? 0),
          ...(hasVideoCompletes
            ? { completionRate: completionRatePct(Number(d.videoCompletes ?? 0), Number(d.impressions ?? 0)) }
            : { clicks: Number(d.clicks ?? 0) }),
        })),
        series: dailyChartSeries,
        asAtDate: asAtISO,
        brandColour: input.brandColour,
      },
    },
    lineItems: accordionItems,
  }
}

function ratioTargetPercentPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || raw <= 0) return undefined
  return normaliseRatioTarget(raw) * 100
}
