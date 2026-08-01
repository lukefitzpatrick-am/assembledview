/**
 * B1-1 — Campaign KPI pacing (display-only).
 *
 * Read path only. Never writes campaign_kpi / client_kpi / publisher_kpi.
 * Percent targets go through `percentUnits.ts` (AV-25); ambiguous / non-decimal
 * stored values never coerce to a guessed number.
 *
 * Status uses the delivery `computeStatus` ladder + thresholds — no second ladder.
 */

import {
  classifyStoredKpiPercentForScan,
  formatStoredDecimalAsPercent,
  KPI_RATIO_PERCENT_METRICS,
} from "@/lib/kpi/percentUnits"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import {
  computeCampaignDays,
  computeDaysPassed,
  computeExpectedPct,
  computeProjectedTotal,
  computeProjectionVariancePct,
  computeDailyPace,
  computeStatus,
  getAsOfDate,
  type PacingStatus,
} from "@/lib/pacing/maths"
import { pacingStatus, type ResolvedPacingStatus } from "@/lib/pacing/status"

export const KPI_PACING_METRICS = [
  "ctr",
  "cpv",
  "conversion_rate",
  "vtr",
  "frequency",
] as const

export type KpiPacingMetric = (typeof KPI_PACING_METRICS)[number]

/** Delivery aggregates available on the campaign page today (digital snapshot + spend). */
export type KpiPacingDeliveryFeed = {
  impressions: number
  clicks: number
  /** Snowflake `results` / conversions where the channel reports them. */
  results: number
  spendToDate: number
  /** 3-second video views — not a completed-view / VTR numerator; never map to VTR/CPV. */
  video3sViews: number
}

export type KpiPacingRowKind =
  | "paced"
  | "no_delivery_feed"
  | "pending_review"

export type KpiPacingRow = {
  metric: KpiPacingMetric
  label: string
  kind: KpiPacingRowKind
  /** Raw stored target when set (null when unset — row omitted). */
  targetRaw: number
  /** Display string for target, or "—" when pending review. */
  targetDisplay: string
  deliveredDisplay: string
  expectedDisplay: string
  statusLabel: string | null
  statusPresentation: ResolvedPacingStatus | null
  /** Grey copy for no-feed / pending rows. */
  fallbackLabel: string | null
  /** Maths status when paced; null otherwise. */
  mathsStatus: PacingStatus | null
  targetValue: number | null
  deliveredValue: number | null
  expectedValue: number | null
}

const RATIO_SET = new Set<string>(KPI_RATIO_PERCENT_METRICS)

/**
 * Static mapping: campaign_kpi metric → delivery actual available today.
 * Design input for real B1 — keep UI and this table in sync.
 *
 * | Metric           | Needed actual              | Available today                         | Paceable? |
 * |------------------|----------------------------|-----------------------------------------|-----------|
 * | ctr              | clicks / impressions       | planTotals.clicks + impressions         | yes       |
 * | conversion_rate  | results / clicks           | planTotals.results + clicks             | yes*      |
 * | cpv              | spend / completed views    | spend yes; completed views no           | no        |
 * | vtr              | completes / impressions    | impressions yes; completes no           | no        |
 * | frequency        | impressions / reach        | impressions yes; reach no               | no        |
 * | (spend / imps)   | not campaign_kpi fields    | available but not KPI targets           | n/a       |
 *
 * *conversion_rate only when clicks > 0 so the ratio is defined.
 * video3sViews is intentionally not mapped (unit mismatch vs CPV/VTR).
 */
export function kpiHasDeliveryFeedMapping(metric: KpiPacingMetric): boolean {
  return metric === "ctr" || metric === "conversion_rate"
}

export function resolveDeliveredActual(
  metric: KpiPacingMetric,
  feed: KpiPacingDeliveryFeed,
): number | null {
  if (metric === "ctr") {
    if (!(feed.impressions > 0)) return null
    return feed.clicks / feed.impressions
  }
  if (metric === "conversion_rate") {
    if (!(feed.clicks > 0)) return null
    return feed.results / feed.clicks
  }
  return null
}

/** Linear expected-to-date — same convention as delivery pacing (`budget * elapsedPct`). */
export function computeKpiExpectedToDate(
  target: number,
  daysPassed: number,
  campaignDays: number,
): number {
  return target * computeExpectedPct(daysPassed, campaignDays)
}

/**
 * Apply the delivery `computeStatus` ladder to a KPI target vs delivered value.
 * Projects finish as `(delivered / daysPassed) * campaignDays` vs full target —
 * same projectionVariancePct path as spend pacing.
 */
export function computeKpiPacingMathsStatus(input: {
  asOfDate: string
  startDate: string
  endDate: string
  target: number
  delivered: number
  daysPassed: number
  campaignDays: number
}): PacingStatus {
  const { asOfDate, startDate, endDate, target, delivered, daysPassed, campaignDays } = input
  const dailyPace = computeDailyPace(delivered, daysPassed)
  const projectedTotal = computeProjectedTotal(dailyPace, campaignDays)
  const projectionVariancePct = computeProjectionVariancePct(projectedTotal, target)
  return computeStatus({
    asOfDate,
    startDate,
    endDate,
    spendToDate: delivered,
    daysPassed,
    projectionVariancePct,
  })
}

function isRatioMetric(metric: KpiPacingMetric): boolean {
  return RATIO_SET.has(metric)
}

/** True when stored percent cannot be shown without guessing (AV-25 / C-20). */
export function isKpiTargetPendingReview(metric: KpiPacingMetric, raw: number): boolean {
  if (!isRatioMetric(metric)) return false
  const scan = classifyStoredKpiPercentForScan(raw)
  if (scan.ambiguous) return true
  // Leftover percentage-point / anomalous cells — do not auto-rescale for display.
  return scan.inferredUnit === "percent_points" || scan.inferredUnit === "anomalous"
}

function formatMetricValue(metric: KpiPacingMetric, value: number): string {
  if (isRatioMetric(metric)) {
    return formatStoredDecimalAsPercent(value)
  }
  if (metric === "cpv") {
    return `$${value.toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  // frequency
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 })
}

/** First non-null finite target per metric across campaign_kpi rows. */
export function collectCampaignKpiTargets(
  rows: CampaignKPI[],
): Partial<Record<KpiPacingMetric, number>> {
  const out: Partial<Record<KpiPacingMetric, number>> = {}
  for (const metric of KPI_PACING_METRICS) {
    for (const row of rows) {
      const raw = row[metric]
      if (raw === null || raw === undefined) continue
      const n = typeof raw === "number" ? raw : Number(raw)
      if (!Number.isFinite(n)) continue
      out[metric] = n
      break
    }
  }
  return out
}

export type BuildKpiPacingRowsInput = {
  campaignKpis: CampaignKPI[]
  feed: KpiPacingDeliveryFeed
  startDate: string | null | undefined
  endDate: string | null | undefined
  asOfDate?: string
}

/**
 * Build display rows for the admin KPI pacing strip.
 * Returns [] when no KPI targets exist (strip must not render).
 */
export function buildKpiPacingRows(input: BuildKpiPacingRowsInput): KpiPacingRow[] {
  const targets = collectCampaignKpiTargets(input.campaignKpis)
  const metricsWithTargets = KPI_PACING_METRICS.filter((m) => targets[m] !== undefined)
  if (metricsWithTargets.length === 0) return []

  const asOfDate = input.asOfDate ?? getAsOfDate()
  const startDate = typeof input.startDate === "string" ? input.startDate : ""
  const endDate = typeof input.endDate === "string" ? input.endDate : ""
  const hasDates = Boolean(startDate && endDate)
  const campaignDays = hasDates ? computeCampaignDays(startDate, endDate) : 0
  const daysPassed = hasDates ? computeDaysPassed(startDate, endDate, asOfDate) : 0

  return metricsWithTargets.map((metric) => {
    const targetRaw = targets[metric]!
    const label = CLIENT_KPI_METRIC_LABELS[metric] ?? metric

    if (isKpiTargetPendingReview(metric, targetRaw)) {
      return {
        metric,
        label,
        kind: "pending_review",
        targetRaw,
        targetDisplay: "—",
        deliveredDisplay: "—",
        expectedDisplay: "—",
        statusLabel: null,
        statusPresentation: null,
        fallbackLabel: "Pending KPI data review",
        mathsStatus: null,
        targetValue: null,
        deliveredValue: null,
        expectedValue: null,
      }
    }

    if (!kpiHasDeliveryFeedMapping(metric)) {
      return {
        metric,
        label,
        kind: "no_delivery_feed",
        targetRaw,
        targetDisplay: formatMetricValue(metric, targetRaw),
        deliveredDisplay: "—",
        expectedDisplay: "—",
        statusLabel: null,
        statusPresentation: null,
        fallbackLabel: "No delivery feed",
        mathsStatus: null,
        targetValue: targetRaw,
        deliveredValue: null,
        expectedValue: null,
      }
    }

    const delivered = resolveDeliveredActual(metric, input.feed)
    if (delivered === null || !hasDates || !(campaignDays > 0) || !(targetRaw > 0)) {
      return {
        metric,
        label,
        kind: "no_delivery_feed",
        targetRaw,
        targetDisplay: formatMetricValue(metric, targetRaw),
        deliveredDisplay: "—",
        expectedDisplay: "—",
        statusLabel: null,
        statusPresentation: null,
        fallbackLabel: "No delivery feed",
        mathsStatus: null,
        targetValue: targetRaw,
        deliveredValue: null,
        expectedValue: null,
      }
    }

    const expected = computeKpiExpectedToDate(targetRaw, daysPassed, campaignDays)
    const mathsStatus = computeKpiPacingMathsStatus({
      asOfDate,
      startDate,
      endDate,
      target: targetRaw,
      delivered,
      daysPassed,
      campaignDays,
    })
    const statusPresentation = pacingStatus(mathsStatus)

    return {
      metric,
      label,
      kind: "paced",
      targetRaw,
      targetDisplay: formatMetricValue(metric, targetRaw),
      deliveredDisplay: formatMetricValue(metric, delivered),
      expectedDisplay: formatMetricValue(metric, expected),
      statusLabel: statusPresentation.label,
      statusPresentation,
      fallbackLabel: null,
      mathsStatus,
      targetValue: targetRaw,
      deliveredValue: delivered,
      expectedValue: expected,
    }
  })
}
