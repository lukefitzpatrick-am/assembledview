import type { KPITargetsMap } from "./deliveryTargets"
import { kpiTargetKey } from "./deliveryTargets"

/**
 * A minimal line-item shape the curve builder needs. Callers pass their
 * container's normalised line items; we only read bursts, buy type, and
 * the three tuple fields used to look up targets.
 */
export interface TargetCurveLineItem {
  mediaType: string
  publisher: string
  bidStrategy: string
  buyType: string
  /** Total planned deliverables across all bursts (e.g. planned clicks for CPC lines). */
  deliverables: number
  /** Earliest burst start (ISO YYYY-MM-DD). If absent, fallback to campaignStart. */
  earliestStartISO: string | null
  /** Latest burst end (ISO YYYY-MM-DD). If absent, fallback to campaignEnd. */
  latestEndISO: string | null
}

export type TargetMetric = "clicks" | "views"

export interface TargetCurvePoint {
  /** ISO YYYY-MM-DD */
  date: string
  /** Cumulative expected value by this date, pro-rated linearly across the campaign window */
  target: number
  /** Lower bound of the ±15% band */
  targetLow: number
  /** Upper bound of the ±15% band */
  targetHigh: number
}

export interface BuildTargetCurveOptions {
  campaignStartISO: string
  campaignEndISO: string
  lineItems: TargetCurveLineItem[]
  kpiTargets: KPITargetsMap
  metric: TargetMetric
  /** 0–1 tolerance. Default 0.15 (±15%). */
  tolerance?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseISODateOnly(iso: string): Date | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatISODateOnly(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function eachDayISO(startISO: string, endISO: string): string[] {
  const start = parseISODateOnly(startISO)
  const end = parseISODateOnly(endISO)
  if (!start || !end || end.getTime() < start.getTime()) return []
  const out: string[] = []
  for (let d = start.getTime(); d <= end.getTime(); d += MS_PER_DAY) {
    out.push(formatISODateOnly(new Date(d)))
  }
  return out
}

/**
 * Rate that converts deliverables to the target metric. For clicks: CTR.
 * For views: VTR. Returns 0 if no matching KPI target or rate is 0.
 */
function rateForMetric(
  item: TargetCurveLineItem,
  kpiTargets: KPITargetsMap,
  metric: TargetMetric,
): number {
  const key = kpiTargetKey(item.mediaType, item.publisher, item.bidStrategy)
  const t = kpiTargets.get(key)
  if (!t) return 0
  if (metric === "clicks") return Number(t.ctr) || 0
  if (metric === "views") return Number(t.vtr) || 0
  return 0
}

/**
 * Per-line-item total target = deliverables × rate, unless the line item is
 * itself in the target metric (e.g. a CPC line's deliverables ARE clicks).
 * For CPC / CPA / CPL lines, treat `deliverables` as already being the
 * metric itself; CTR is ignored.
 */
function totalTargetForLineItem(
  item: TargetCurveLineItem,
  kpiTargets: KPITargetsMap,
  metric: TargetMetric,
): number {
  const deliverables = Number(item.deliverables) || 0
  if (deliverables <= 0) return 0
  const bt = (item.buyType || "").toLowerCase()
  if (metric === "clicks") {
    if (bt === "cpc" || bt === "cpa" || bt === "cpl" || bt.includes("cpc")) {
      return deliverables
    }
    const rate = rateForMetric(item, kpiTargets, metric)
    return rate > 0 ? deliverables * rate : 0
  }
  if (metric === "views") {
    if (bt === "cpv" || bt.includes("cpv")) {
      return deliverables
    }
    const rate = rateForMetric(item, kpiTargets, metric)
    return rate > 0 ? deliverables * rate : 0
  }
  return 0
}

/**
 * Build a cumulative, linearly-pro-rated target curve across the campaign
 * window. Each line item contributes linearly across its own start→end
 * window, clipped to the campaign window. The curve includes a ±tolerance
 * band.
 *
 * Returns an empty array when campaign window is invalid or no line items
 * produce a non-zero target — caller should render no band in that case.
 */
export function buildCumulativeTargetCurve(
  opts: BuildTargetCurveOptions,
): TargetCurvePoint[] {
  const { campaignStartISO, campaignEndISO, lineItems, kpiTargets, metric } = opts
  const tolerance = opts.tolerance ?? 0.15

  const days = eachDayISO(campaignStartISO, campaignEndISO)
  if (days.length === 0) return []

  // Daily contribution per line item, clipped to the campaign window.
  const dailyByDate = new Map<string, number>()
  for (const day of days) dailyByDate.set(day, 0)

  for (const item of lineItems) {
    const total = totalTargetForLineItem(item, kpiTargets, metric)
    if (total <= 0) continue

    const rawStart = item.earliestStartISO ?? campaignStartISO
    const rawEnd = item.latestEndISO ?? campaignEndISO
    const itemStart = parseISODateOnly(rawStart)
    const itemEnd = parseISODateOnly(rawEnd)
    const camStart = parseISODateOnly(campaignStartISO)
    const camEnd = parseISODateOnly(campaignEndISO)
    if (!itemStart || !itemEnd || !camStart || !camEnd) continue

    const effStart = new Date(Math.max(itemStart.getTime(), camStart.getTime()))
    const effEnd = new Date(Math.min(itemEnd.getTime(), camEnd.getTime()))
    if (effEnd.getTime() < effStart.getTime()) continue

    const effDays =
      Math.round((effEnd.getTime() - effStart.getTime()) / MS_PER_DAY) + 1
    if (effDays <= 0) continue

    const perDay = total / effDays

    for (
      let t = effStart.getTime();
      t <= effEnd.getTime();
      t += MS_PER_DAY
    ) {
      const iso = formatISODateOnly(new Date(t))
      if (dailyByDate.has(iso)) {
        dailyByDate.set(iso, (dailyByDate.get(iso) || 0) + perDay)
      }
    }
  }

  let totalAll = 0
  for (const v of dailyByDate.values()) totalAll += v
  if (totalAll <= 0) return []

  const out: TargetCurvePoint[] = []
  let cum = 0
  for (const day of days) {
    cum += dailyByDate.get(day) || 0
    const target = Math.round(cum)
    out.push({
      date: day,
      target,
      targetLow: Math.round(target * (1 - tolerance)),
      targetHigh: Math.round(target * (1 + tolerance)),
    })
  }
  return out
}

/**
 * Build a cumulative series from a daily `actuals` array keyed by date.
 * Output aligns to the same `dates` axis used by the target curve.
 */
export function buildCumulativeActualSeries(
  dates: string[],
  dailyActualsByDate: Map<string, number>,
): Array<{ date: string; actual: number }> {
  const out: Array<{ date: string; actual: number }> = []
  let cum = 0
  for (const day of dates) {
    cum += Math.max(0, dailyActualsByDate.get(day) || 0)
    out.push({ date: day, actual: Math.round(cum) })
  }
  return out
}

/**
 * Determine on-track status at a specific "as at" date based on whether
 * actual cumulative value is inside the ±tolerance band at that date.
 *
 * Returns "no-data" when we can't evaluate (missing target, missing actual,
 * or outside campaign window).
 */
export type OnTrackStatus = "on-track" | "ahead" | "behind" | "no-data"

export function evaluateOnTrack(
  targetCurve: TargetCurvePoint[],
  actualByDate: Map<string, number>,
  asAtISO: string,
): OnTrackStatus {
  if (!targetCurve.length) return "no-data"
  const point = targetCurve.find((p) => p.date === asAtISO)
  if (!point) return "no-data"
  const actual = actualByDate.get(asAtISO)
  if (actual === undefined) return "no-data"
  if (actual < point.targetLow) return "behind"
  if (actual > point.targetHigh) return "ahead"
  return "on-track"
}
