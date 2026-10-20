import { hasPositiveDelivery } from "@/lib/spend/assumeSpendRule"
import { buildAssumedSpendSection, digitalAssumedSource } from "./assumedSpendAdapter"
import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import { formatMoney } from "@/lib/format/money"
import { applyKpiBandTargetsFromPlan } from "@/lib/kpi/kpiBandTargets"
import { getLineItemKpiRow } from "@/lib/kpi/lineItemKpiTargets"
import { cpm, ctr as clickThroughRate } from "@/lib/money/rates"
import {
  ESTIMATED_SPEND_LABEL,
  estimateDirectDigitalSpend,
  NO_PLANNED_IMPRESSIONS,
} from "@/lib/delivery/estimateDirectDigitalSpend"
import {
  feePctFromVersionMap,
  positiveVersionId,
  versionIdFromLine,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { isCpcBuyType } from "@/lib/kpi/kpiReview"
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget"
import type { CampaignKPI } from "@/lib/kpi/types"
import { expectedSpendToDateFromBursts } from "@/lib/spend/expectedSpendToDateFromBursts"
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
import { lineDatesFromBursts } from "@/lib/delivery/lineChartWindow"
import {
  DIRECT_DIGITAL_CLICKS_SERIES,
  DIRECT_DIGITAL_COMPLETION_SERIES,
  DIRECT_DIGITAL_IMPRESSIONS_SERIES,
} from "./channelChartSeries"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"

const FIXED_COST_SPEND_LABEL = "Reported spend (fixed cost)"
const CM360_ESTIMATED_CONNECTION =
  "Ad server verification (CM360) — spend estimated from the plan rate"
const CM360_COUNTS_CONNECTION = "Ad server verification (CM360) — delivery counts"

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
  budget_includes_fees?: boolean
  media_plan_version?: unknown
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

function fmtRatioDecimal(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(2)}%`
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
  /** Shown instead of "No plan goal" when the estimate cannot be priced. */
  emptyReason?: string | null
}): ProgressCardProps {
  const { title, actual, planned, sparkline, dense, emptyReason } = input
  const hasGoal = planned > 0
  const progress = hasGoal ? Math.max(0, Math.min(1, safeDiv(actual, planned))) : 0
  const pacingPct = hasGoal ? safeDiv(actual, planned) * 100 : undefined
  return {
    title,
    value: formatWholeNumber(actual),
    detail: hasGoal
      ? `Delivered ${formatWholeNumber(actual)} · Planned ${formatWholeNumber(planned)}`
      : `Delivered ${formatWholeNumber(actual)} · ${emptyReason || "No plan goal"}`,
    progress,
    variance: hasGoal ? pctVarianceFromPacingPct(pacingPct) : 0,
    varianceLabel: hasGoal ? "vs plan deliverable" : "verification counts only",
    status: hasGoal ? deliveryStatusFromPct(pacingPct) : "no-data",
    sparkline,
    dense,
  }
}

function spendDeliveryProgressCard(input: {
  title: string
  actual: number
  planned: number
  expectedToDate?: number | null
  sparkline: number[]
  dense?: boolean
  spendMode?: "reported" | "estimated"
  detailOverride?: string
}): ProgressCardProps {
  const { title, actual, planned, expectedToDate, sparkline, dense, spendMode = "reported", detailOverride } = input
  const hasGoal = planned > 0
  const hasExpected = expectedToDate != null && expectedToDate > 0
  const progress = hasGoal ? Math.max(0, Math.min(1, safeDiv(actual, planned))) : 0
  const pacingPct = hasExpected
    ? safeDiv(actual, expectedToDate) * 100
    : hasGoal
      ? safeDiv(actual, planned) * 100
      : undefined
  const lead =
    spendMode === "estimated" ? "Estimated" : hasExpected ? "Reported" : "Delivered"
  return {
    title,
    titleTooltip:
      spendMode === "estimated"
        ? "Estimated from the plan rate (planned media ÷ planned deliverables), capped at planned media."
        : undefined,
    value: formatMoney(actual),
    detail:
      detailOverride ??
      (hasExpected
        ? `${lead} ${formatMoney(actual)} · Planned ${formatMoney(planned)} · Expected to date ${formatMoney(expectedToDate)}`
        : hasGoal
          ? `${lead} ${formatMoney(actual)} · Planned ${formatMoney(planned)}`
          : `${lead} ${formatMoney(actual)} · No plan goal`),
    progress,
    variance: pacingPct != null ? pctVarianceFromPacingPct(pacingPct) : 0,
    varianceLabel: hasExpected ? "vs expected to date" : hasGoal ? "vs plan spend" : "reported spend",
    status: pacingPct != null ? deliveryStatusFromPct(pacingPct) : "no-data",
    sparkline,
    dense,
  }
}

function markEstimatedCostTiles(tiles: KpiTileProps[], estimated: boolean): KpiTileProps[] {
  if (!estimated) return tiles
  return tiles.map((tile) =>
    tile.label === "CPM" || tile.label === "CPV" || tile.label === "CPC"
      ? { ...tile, caption: "Estimated" }
      : tile,
  )
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
 * Direct Booked Digital (CM360). Spend is estimated from the plan rate
 * (`estimateDirectDigitalSpend`) and labelled from `spendMode`. Platform
 * `amount_spent` is not used. Fixed-cost lines keep REPORTED_SPEND from
 * FIXED_COST_REPORTED_DAILY_FACT; reported replaces the estimate.
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
  isAdmin?: boolean
  feePctsByVersionId?: FeePctsByVersionId
  estimateVersionId?: number | null
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
    isAdmin = false,
    feePctsByVersionId,
    estimateVersionId,
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
  const adRowsWithDelivery = adRows.filter((row) =>
    hasPositiveDelivery({
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.amountSpent,
    }),
  )
  // No CM360 delivery: an assume-spend plan renders Assumed spend. A zero row is not delivery.
  if (!adRowsWithDelivery.length) {
    const source = digitalAssumedSource(key)
    if (!source) return null
    return buildAssumedSpendSection({
      key,
      lineItems: normalized.map((item) => ({ ...item, sourceTable: source.sourceTable })),
      campaignStart,
      campaignEnd,
      lastSyncedAt,
      asOfDate: asOfDate || getMelbourneTodayISO(),
      feePctsByVersionId,
      estimateVersionId,
      mediaType: source.mediaType,
    })
  }

  const asAtISO = asOfDate || getMelbourneTodayISO()
  // Channel chrome uses media-type colour; brandColour stays on chart props only (AVU5-4).
  const mediaTypeColour = channelMediaTypeColour(key)
  const accentColour = mediaTypeColour

  const metrics = normalized.map((item) => {
    const id = item.line_item_id!
    const matched = adRows.filter((r) => String(r.lineItemId).toLowerCase() === id)
    const byDate = new Map<string, DailyActuals>()
    for (const row of matched) {
      const date = normalizeDailyFactDate(row.dateDay) ?? ""
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
    const versionId = versionIdFromLine(item) ?? positiveVersionId(estimateVersionId)
    const feeChannel =
      key === "digital-display" ||
      key === "digital-video" ||
      key === "digital-audio" ||
      key === "bvod"
        ? key
        : null
    const estimate = hasReportedEntries
      ? null
      : estimateDirectDigitalSpend({
          lineItemId: id,
          buyType: item.buy_type,
          fixedCost: isFixedCostMedia(item),
          budgetIncludesFees: item.budget_includes_fees === true,
          feePct: feePctFromVersionMap(feePctsByVersionId, versionId, feeChannel),
          versionId,
          bursts: item.bursts_json ?? item.bursts,
          days: daily.map((d) => ({
            date: d.date,
            impressions: d.impressions,
            clicks: d.clicks,
            results: d.results,
            video3sViews: d.videoCompletes,
          })),
        })
    const estimatedAmount = estimate?.amount != null && estimate.amount > 0 ? estimate.amount : 0
    const estimateByDate = new Map((estimate?.days ?? []).map((day) => [day.date, day.derivedSpend]))
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
      estimatedAmount,
      estimateReason: estimate?.reason ?? null,
      estimateByDate,
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
  const everyLineHasCompletes = withDelivery.every((m) => m.totals.videoCompletes > 0)
  const impressionsSeries = DIRECT_DIGITAL_IMPRESSIONS_SERIES
  const clicksSeries = DIRECT_DIGITAL_CLICKS_SERIES
  const completionSeries = DIRECT_DIGITAL_COMPLETION_SERIES
  const dailyChartSeries = [
    impressionsSeries,
    everyLineHasCompletes ? completionSeries : clicksSeries,
  ]

  const ctrDecimal = clickThroughRate(rollup.clicks, rollup.impressions)

  const ctrTargetRaw = (() => {
    const rows = withDelivery
      .map((m) => getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id))
      .filter(Boolean) as CampaignKPI[]
    if (!rows.length) return undefined
    const first = rows[0]?.ctr
    if (first == null || first <= 0) return undefined
    if (!rows.every((r) => r.ctr === first)) return undefined
    return normaliseRatioTarget(first)
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
      value: fmtRatioDecimal(ctrDecimal),
      expected: ctrTargetRaw != null ? fmtRatioDecimal(ctrTargetRaw) : undefined,
      status:
        ctrDecimal != null && ctrTargetRaw != null && ctrTargetRaw > 0
          ? deliveryStatusFromPct(safeDiv(ctrDecimal, ctrTargetRaw) * 100)
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
  const estimatedLines = withDelivery.filter((m) => m.estimatedAmount > 0)
  const reportedSpendTotal = reportedLines.reduce((sum, m) => sum + m.reportedTotal, 0)
  const estimatedSpendTotal = estimatedLines.reduce((sum, m) => sum + m.estimatedAmount, 0)
  const reportedSpendPlanned = reportedLines.reduce((sum, m) => sum + m.bookedSpend, 0)
  const estimatedSpendPlanned = estimatedLines.reduce((sum, m) => sum + m.bookedSpend, 0)
  const reportedSpendSpark = aggDaily.map((d) => {
    const date = String(d.date ?? "")
    return reportedLines.reduce((sum, m) => sum + (m.reportedByDate?.get(date) ?? 0), 0)
  })
  const estimatedSpendSpark = aggDaily.map((d) => {
    const date = String(d.date ?? "")
    return estimatedLines.reduce((sum, m) => sum + (m.estimateByDate.get(date) ?? 0), 0)
  })
  const reportedExpectedToDate = reportedLines.every((m) => m.expectedSpendToDate != null)
    ? reportedLines.reduce((sum, m) => sum + (m.expectedSpendToDate ?? 0), 0)
    : null
  const estimatedExpectedToDate = estimatedLines.every((m) => m.expectedSpendToDate != null)
    ? estimatedLines.reduce((sum, m) => sum + (m.expectedSpendToDate ?? 0), 0)
    : null
  const spendCard =
    reportedLines.length > 0 && estimatedLines.length > 0
      ? spendDeliveryProgressCard({
          title: "Spend",
          actual: reportedSpendTotal + estimatedSpendTotal,
          planned: reportedSpendPlanned + estimatedSpendPlanned,
          sparkline: reportedSpendSpark.map((value, index) => value + (estimatedSpendSpark[index] ?? 0)),
          spendMode: "estimated",
        })
      : reportedLines.length > 0
        ? spendDeliveryProgressCard({
            title: FIXED_COST_SPEND_LABEL,
            actual: reportedSpendTotal,
            planned: reportedSpendPlanned,
            expectedToDate: reportedExpectedToDate,
            sparkline: reportedSpendSpark,
            spendMode: "reported",
          })
        : estimatedLines.length > 0
          ? spendDeliveryProgressCard({
              title: ESTIMATED_SPEND_LABEL,
              actual: estimatedSpendTotal,
              planned: estimatedSpendPlanned,
              expectedToDate: estimatedExpectedToDate,
              sparkline: estimatedSpendSpark,
              spendMode: "estimated",
            })
          : null
  const aggregateProgressCards: [ProgressCardProps, ProgressCardProps] = spendCard
    ? [spendCard, impressionsCard]
    : [impressionsCard, clicksCard]

  const plannedSpendByLineId: Record<string, number> = {}
  for (const m of withDelivery) {
    plannedSpendByLineId[m.id] = m.bookedSpend
  }
  const aggregateSpend =
    reportedSpendTotal + estimatedSpendTotal > 0 ? reportedSpendTotal + estimatedSpendTotal : null
  const aggregateSpendEstimated = estimatedLines.length > 0 && reportedLines.length === 0
  const cpvTile: KpiTileProps[] =
    hasVideoCompletes || key === "bvod"
      ? [
          {
            label: "CPV",
            value:
              aggregateSpend != null && rollup.videoCompletes > 0
                ? formatMoney(aggregateSpend / rollup.videoCompletes)
                : "—",
            caption: aggregateSpendEstimated && rollup.videoCompletes > 0 ? "Estimated" : undefined,
            accentColour,
          },
        ]
      : []
  const aggregateCostTiles: KpiTileProps[] = aggregateSpendEstimated
    ? [
        ...(rollup.impressions > 0
          ? [
              {
                label: "CPM",
                value: formatMoney(cpm(aggregateSpend ?? 0, rollup.impressions)),
                caption: "Estimated",
                accentColour,
              } satisfies KpiTileProps,
            ]
          : []),
        ...(estimatedLines.every((m) => isCpcBuyType(m.item.buy_type)) && rollup.clicks > 0
          ? [
              {
                label: "CPC",
                value: formatMoney((aggregateSpend ?? 0) / rollup.clicks),
                caption: "Estimated",
                accentColour,
              } satisfies KpiTileProps,
            ]
          : []),
      ]
    : []
  const bandTiles = markEstimatedCostTiles(applyKpiBandTargetsFromPlan([...aggregateKpiTiles, ...cpvTile, ...aggregateCostTiles], {
    key,
    items: withDelivery.map((m) => m.item),
    plannedSpendByLineId,
    impressions: rollup.impressions,
    clicks: rollup.clicks,
    results: rollup.results,
    views: rollup.videoCompletes > 0 ? rollup.videoCompletes : null,
    spend: aggregateSpend,
    lineItemTargets,
    isAdmin,
  }), aggregateSpendEstimated)

  const accordionItems = withDelivery.map((m) => {
    const liCtr = clickThroughRate(m.totals.clicks, m.totals.impressions)
    const kpiRow = getLineItemKpiRow(input.lineItemTargets, input.mbaNumber, input.kpiVersionNumber, m.id)
    const liCtrTarget =
      kpiRow?.ctr != null && kpiRow.ctr > 0 ? normaliseRatioTarget(kpiRow.ctr) : undefined

    const lineHasCompletes = m.totals.videoCompletes > 0
    const dailyRows = m.daily.map((d) => ({
      date: d.date,
      impressions: Number(d.impressions ?? 0),
      ...(lineHasCompletes
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
      emptyReason: m.estimateReason === NO_PLANNED_IMPRESSIONS ? m.estimateReason : null,
    })
    const clicksCard = deliveryProgressCard({
      title: "Clicks delivery",
      actual: m.totals.clicks,
      planned: m.booked.clicks,
      sparkline: m.daily.map((d) => d.clicks),
      dense: true,
    })
    const lineSpend = m.hasReportedEntries
      ? m.reportedTotal
      : m.estimatedAmount > 0
        ? m.estimatedAmount
        : null
    const lineSpendMode = m.hasReportedEntries
      ? "reported"
      : m.estimatedAmount > 0
        ? "estimated"
        : null
    const lineSpendCard = m.hasReportedEntries
      ? spendDeliveryProgressCard({
          title: FIXED_COST_SPEND_LABEL,
          actual: m.reportedTotal,
          planned: m.bookedSpend,
          expectedToDate: m.expectedSpendToDate,
          sparkline: m.daily.map((d) => m.reportedByDate?.get(d.date) ?? 0),
          dense: true,
          spendMode: "reported",
        })
      : m.estimatedAmount > 0
        ? spendDeliveryProgressCard({
            title: ESTIMATED_SPEND_LABEL,
            actual: m.estimatedAmount,
            planned: m.bookedSpend,
            expectedToDate: m.expectedSpendToDate,
            sparkline: m.daily.map((d) => m.estimateByDate.get(d.date) ?? 0),
            dense: true,
            spendMode: "estimated",
          })
        : null
    const block: LineItemBlockProps = {
      name: displayName.label,
      fullName: displayName.full,
      platform: String(m.item.buy_type ?? m.item.platform ?? "CM360"),
      progressCards: lineSpendCard ? [lineSpendCard, impressionCard] : [impressionCard, clicksCard],
      kpiBand: {
        title: "Verification KPIs",
        tiles: markEstimatedCostTiles(applyKpiBandTargetsFromPlan(
          [
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
            value: fmtRatioDecimal(liCtr),
            expected: liCtrTarget != null ? fmtRatioDecimal(liCtrTarget) : undefined,
            status:
              liCtr != null && liCtrTarget != null && liCtrTarget > 0
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
          ...(hasVideoCompletes || key === "bvod"
            ? [
                {
                  label: "CPV",
                  value:
                    lineSpend != null && m.totals.videoCompletes > 0
                      ? formatMoney(lineSpend / m.totals.videoCompletes)
                      : "—",
                  caption: lineSpendMode === "estimated" && m.totals.videoCompletes > 0 ? "Estimated" : undefined,
                  accentColour,
                } satisfies KpiTileProps,
              ]
            : []),
          ...(lineSpendMode === "estimated" && m.totals.impressions > 0
            ? [
                {
                  label: "CPM",
                  value: formatMoney(cpm(lineSpend ?? 0, m.totals.impressions)),
                  caption: "Estimated",
                  accentColour,
                } satisfies KpiTileProps,
              ]
            : []),
          ...(lineSpendMode === "estimated" && isCpcBuyType(m.item.buy_type) && m.totals.clicks > 0
            ? [
                {
                  label: "CPC",
                  value: formatMoney((lineSpend ?? 0) / m.totals.clicks),
                  caption: "Estimated",
                  accentColour,
                } satisfies KpiTileProps,
              ]
            : []),
        ],
          {
            key,
            items: [m.item],
            plannedSpendByLineId: { [m.id]: m.bookedSpend },
            impressions: m.totals.impressions,
            clicks: m.totals.clicks,
            results: m.totals.results,
            views: m.totals.videoCompletes > 0 ? m.totals.videoCompletes : null,
            spend: lineSpend,
            lineItemTargets,
            isAdmin,
          },
        ), lineSpendMode === "estimated"),
      },
      chart: {
        kind: "daily-delivery",
        daily: dailyRows,
        series: [impressionsSeries, lineHasCompletes ? completionSeries : clicksSeries],
        asAtDate: asAtISO,
        brandColour: input.brandColour,
        lineDates: lineDatesFromBursts(m.item.bursts_json ?? m.item.bursts, {
          startISO: input.campaignStart,
          endISO: input.campaignEnd,
        }),
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
        label: estimatedLines.length > 0 ? CM360_ESTIMATED_CONNECTION : CM360_COUNTS_CONNECTION,
        tone: "cm360",
      },
    ],
    mediaTypeColour,
    aggregate: {
      summaryChips: [
        ...(spendCard
          ? [
              {
                label: spendCard.title,
                value: formatMoney(reportedSpendTotal + estimatedSpendTotal),
              },
            ]
          : []),
        { label: "Served impressions", value: formatWholeNumber(rollup.impressions) },
        { label: "Clicks", value: formatWholeNumber(rollup.clicks) },
        { label: "CTR", value: fmtRatioDecimal(ctrDecimal) },
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
        subtitle: aggregateSpendEstimated
          ? "Spend estimated from the plan rate"
          : reportedLines.length > 0
            ? "Reported spend on fixed-cost lines"
            : "CM360 delivery counts",
        tiles: bandTiles,
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
