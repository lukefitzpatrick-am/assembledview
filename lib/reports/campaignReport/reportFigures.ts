/**
 * Pure figures for the campaign report. The assembler and the deck both
 * read these so campaign to date, rates and file names stay one shape.
 */

import { cpc, cpm, cpv, ctr } from "@/lib/money/rates"
import { computeCampaignDays } from "@/lib/pacing/maths"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import {
  campaignReportPeriodMetrics,
  type CampaignReportPeriodMetrics,
} from "@/lib/reports/campaignReport/periodMetrics"

export type PlanDeliverableCounts = {
  impressions: number | null
  clicks: number | null
  views: number | null
}

export type RateSourceLine = {
  spend: number
  impressions: number
  clicks: number
  views: number
}

function positive(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function burstDeliverableTotal(raw: unknown): number | null {
  const bursts = parseBurstsToNormalised(raw)
  const total = bursts.reduce((sum, burst) => sum + (burst.calculatedValue > 0 ? burst.calculatedValue : 0), 0)
  return positive(total)
}

/** A zero or blank KPI target is not a target. */
export function isBlankKpiTarget(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === "string" && value.trim() === "") return true
  const n = typeof value === "number" ? value : Number(value)
  return !Number.isFinite(n) || n === 0
}

/**
 * Planned impressions, clicks and views on one plan line.
 * An explicit field wins. Otherwise the burst deliverable is assigned by buy type.
 * CPM and anything unstated is impressions. CPC is clicks. CPV is views.
 */
export function planDeliverablesFromItem(item: Record<string, unknown>): PlanDeliverableCounts {
  const impressions = positive(
    asNumber(item.impressions) ?? asNumber(item.plannedImpressions) ?? asNumber(item.planned_impressions),
  )
  const clicks = positive(
    asNumber(item.clicks) ?? asNumber(item.plannedClicks) ?? asNumber(item.planned_clicks),
  )
  const views = positive(
    asNumber(item.videoViews) ??
      asNumber(item.video_views) ??
      asNumber(item.views) ??
      asNumber(item.plannedViews) ??
      asNumber(item.planned_views),
  )
  if (impressions != null || clicks != null || views != null) {
    return { impressions, clicks, views }
  }
  const units = burstDeliverableTotal(item.bursts_json ?? item.bursts) ??
    positive(asNumber(item.units) ?? asNumber(item.quantity) ?? asNumber(item.calculatedValue))
  if (units == null) return { impressions: null, clicks: null, views: null }
  const buy = String(item.buyType ?? item.buy_type ?? item.buying_method ?? "").trim().toLowerCase()
  if (buy === "cpc" || buy === "cpa") return { impressions: null, clicks: units, views: null }
  if (buy === "cpv" || buy === "cpvv") return { impressions: null, clicks: null, views: units }
  return { impressions: units, clicks: null, views: null }
}

function laterISO(a: string, b: string): string {
  return a >= b ? a : b
}

function earlierISO(a: string, b: string): string {
  return a <= b ? a : b
}

/**
 * Line deliverable in the report window. The whole flight is the full figure.
 * A shorter window is that figure times overlap days over the line's flight days.
 */
export function prorateDeliverable(input: {
  total: number
  lineStartISO: string | null
  lineEndISO: string | null
  flightStartISO: string
  flightEndISO: string
  periodStartISO: string
  periodEndISO: string
}): number {
  const { total } = input
  if (!(total > 0)) return 0
  const start = input.lineStartISO ?? input.flightStartISO
  const end = input.lineEndISO ?? input.flightEndISO
  const flightDays = computeCampaignDays(start, end)
  if (flightDays <= 0) return total
  const overlapStart = laterISO(start, input.periodStartISO)
  const overlapEnd = earlierISO(end, input.periodEndISO)
  if (overlapEnd < overlapStart) return 0
  const overlapDays = computeCampaignDays(overlapStart, overlapEnd)
  if (overlapDays >= flightDays) return total
  return total * (overlapDays / flightDays)
}

export function sumProratedDeliverable(
  lines: Array<{
    total: number | null
    lineStartISO: string | null
    lineEndISO: string | null
  }>,
  flight: { startISO: string; endISO: string },
  period: { startISO: string; endISO: string },
): number | null {
  let sum = 0
  let any = false
  for (const line of lines) {
    if (line.total == null || !(line.total > 0)) continue
    any = true
    sum += prorateDeliverable({
      total: line.total,
      lineStartISO: line.lineStartISO,
      lineEndISO: line.lineEndISO,
      flightStartISO: flight.startISO,
      flightEndISO: flight.endISO,
      periodStartISO: period.startISO,
      periodEndISO: period.endISO,
    })
  }
  return any && sum > 0 ? sum : null
}

/**
 * CPM uses spend from lines with impressions. CPC uses spend from lines with
 * clicks. CPV uses spend from lines with views. CTR is clicks over impressions
 * on those same lines. Spend with neither impressions nor clicks is excluded.
 */
export function rateMetricsFromLines(
  lines: RateSourceLine[],
  expectedSpend: number | null,
): { metrics: CampaignReportPeriodMetrics; excludedSpend: number } {
  let totalSpend = 0
  let impressionSpend = 0
  let impressions = 0
  let clickSpend = 0
  let clicks = 0
  let viewSpend = 0
  let views = 0
  let excludedSpend = 0
  for (const line of lines) {
    const spend = Number.isFinite(line.spend) && line.spend > 0 ? line.spend : 0
    totalSpend += spend
    const hasImpressions = line.impressions > 0
    const hasClicks = line.clicks > 0
    const hasViews = line.views > 0
    if (hasImpressions) {
      impressionSpend += spend
      impressions += line.impressions
    }
    if (hasClicks) {
      clickSpend += spend
      clicks += line.clicks
    }
    if (hasViews) {
      viewSpend += spend
      views += line.views
    }
    if (spend > 0 && !hasImpressions && !hasClicks) excludedSpend += spend
  }
  const metrics = campaignReportPeriodMetrics({
    spend: totalSpend,
    impressions,
    clicks,
    video3sViews: views,
    expectedSpend,
  })
  return {
    metrics: {
      ...metrics,
      cpm: cpm(impressionSpend, impressions),
      cpc: cpc(clickSpend, clicks),
      ctr: ctr(clicks, impressions),
      cpv: cpv(viewSpend, views),
      videoViews3s: views > 0 ? views : null,
    },
    excludedSpend,
  }
}

/** "<Channel> was <N>% of campaign spend." Share is already a whole percent. */
export function campaignSpendShareSentence(label: string, sharePct: number): string {
  return `${label} was ${sharePct}% of campaign spend.`
}

/** Generated insight text that states a spend share uses the same sentence. */
export function rewriteCampaignSpendShare(text: string): string {
  return text
    .replace(/\bdelivered\s+(\d+(?:\.\d+)?%)\s+of\s+spend\b/gi, "was $1 of campaign spend")
    .replace(/\bshare of spend\b/gi, "share of campaign spend")
}

export function campaignReportPeriodFilePart(input: {
  kind: CampaignReportPeriodKind
  startISO: string
  endISO: string
}): string {
  if (input.kind === "campaign_to_date") return `campaign-to-date-${input.endISO}`
  if (input.kind === "custom") return `${input.startISO}-to-${input.endISO}`
  return input.startISO.slice(0, 7)
}
