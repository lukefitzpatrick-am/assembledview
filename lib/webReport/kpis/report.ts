import { daysInMonth, formatIsoDate, parseIsoDate, type DateWindow } from "@/lib/webReport/periods"

import { kpiProgress, monthsInWindow, type KpiProgress, type KpiStatus } from "./progress"
import type { WebKpi, WebKpiActual, WebKpiMetric, WebKpiSource, WebKpiTarget } from "./types"

export const KPI_TRACKER_MAX_MONTHS = 12

type ActualSlice = Pick<WebKpiActual, "total" | "months">

/** One active KPI as the report sees it. Deactivated KPIs are never in the report. */
export type WebKpiReportItem = {
  id: string
  label: string
  source: WebKpiSource
  eventNames: string[] | null
  metric: WebKpiMetric | null
  targets: WebKpiTarget[]
  /** Actual over the report window, and per month it touches. */
  window: ActualSlice
  /** Actual per month over the tracker span (the 12 months up to the window's end). */
  tracker: ActualSlice
}

export type WebKpiReport = {
  /** not_ready: migration 0101 is not applied. unavailable: the KPI read failed. */
  status: "ok" | "not_ready" | "unavailable"
  /** Sydney today when the report was loaded. */
  today: string
  /** First of each month in the tracker span, oldest first. */
  trackerMonths: string[]
  items: WebKpiReportItem[]
}

/** Joins KPIs to their window and tracker actuals. Deactivated KPIs are left out. */
export function buildKpiReportItems(
  kpis: readonly WebKpi[],
  windowActuals: readonly WebKpiActual[],
  trackerActuals: readonly WebKpiActual[],
): WebKpiReportItem[] {
  const byWindow = new Map(windowActuals.map((row) => [row.kpiId, row]))
  const byTracker = new Map(trackerActuals.map((row) => [row.kpiId, row]))
  return kpis
    .filter((kpi) => kpi.active)
    .map((kpi) => ({
      id: kpi.id,
      label: kpi.label,
      source: kpi.source,
      eventNames: kpi.eventNames,
      metric: kpi.metric,
      targets: kpi.targets,
      window: byWindow.get(kpi.id) ?? { total: null, months: [] },
      tracker: byTracker.get(kpi.id) ?? { total: null, months: [] },
    }))
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta
  return { y: Math.floor(index / 12), m: (index % 12) + 1 }
}

/** The 12 calendar months up to and including the month of window.to. */
export function trackerWindow(window: DateWindow): DateWindow {
  const to = parseIsoDate(window.to)
  if (!to) return window
  const start = shiftMonth(to.y, to.m, -(KPI_TRACKER_MAX_MONTHS - 1))
  return { from: formatIsoDate(start.y, start.m, 1), to: window.to }
}

export function trackerMonthList(window: DateWindow): string[] {
  return monthsInWindow(trackerWindow(window)).map((item) => item.month)
}

/** Fixed names: en-AU Intl prints "Sept", and output must not depend on the runtime's ICU data. */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

export function monthShort(month: string): string {
  const parsed = parseIsoDate(month)
  return parsed ? MONTH_NAMES[parsed.m - 1] : month
}

export function monthLabel(month: string): string {
  const parsed = parseIsoDate(month)
  return parsed ? `${MONTH_NAMES[parsed.m - 1]} ${String(parsed.y % 100).padStart(2, "0")}` : month
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/**
 * Caption for a tile whose window is only partly covered by targets, e.g.
 * "Target covers Oct only". Null when every month has a target or none does.
 */
export function coverageNote(progress: Pick<KpiProgress, "monthsWithoutTarget">, window: DateWindow): string | null {
  const months = monthsInWindow(window).map((item) => item.month)
  const missing = new Set(progress.monthsWithoutTarget)
  const covered = months.filter((month) => !missing.has(month))
  if (covered.length === 0 || covered.length === months.length) return null
  return `Target covers ${joinList(covered.map(monthShort))} only`
}

/** Pace against targets for the report window, using the KP1 rule (targeted months only). */
export function kpiWindowProgress(item: WebKpiReportItem, window: DateWindow, asOf: string): KpiProgress {
  return kpiProgress(item, item.window, window, asOf)
}

export type KpiTrackerRow = {
  month: string
  label: string
  actual: number | null
  /** The month's full target. Null when the month has none. */
  target: number | null
  /** actual minus target. Null when either is missing. */
  variance: number | null
  /** Pace to date for the month (pro-rated in a part month). no-data without a target. */
  status: KpiStatus
}

function monthWindow(month: string, spanTo: string): DateWindow {
  const parsed = parseIsoDate(month)
  if (!parsed) return { from: month, to: month }
  const end = formatIsoDate(parsed.y, parsed.m, daysInMonth(parsed.y, parsed.m))
  return { from: month, to: end < spanTo ? end : spanTo }
}

/**
 * One row per month for the last `count` months of the tracker span. A month
 * with no target keeps its actual; target, variance and status are empty.
 */
export function kpiTrackerRows(
  item: Pick<WebKpi, "targets"> & { tracker: ActualSlice },
  trackerMonths: readonly string[],
  count: number,
  spanTo: string,
  asOf: string,
): KpiTrackerRow[] {
  const months = trackerMonths.slice(-count)
  const actuals = new Map(item.tracker.months.map((row) => [row.month, row.actual]))
  const targets = new Map(item.targets.map((row) => [row.month, row.target]))
  return months.map((month) => {
    const actual = item.tracker.total == null ? null : (actuals.get(month) ?? 0)
    const target = targets.get(month) ?? null
    const variance = actual != null && target != null ? actual - target : null
    const progress =
      target == null
        ? null
        : kpiProgress(
            { targets: [{ month, target }] },
            actual == null ? null : { total: actual, months: [{ month, actual }] },
            monthWindow(month, spanTo),
            asOf,
          )
    return { month, label: monthLabel(month), actual, target, variance, status: progress?.status ?? "no-data" }
  })
}
