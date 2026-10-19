import { roundMoney2 } from "@/lib/money/cents"
import type { DeliveryStatus } from "@/lib/pacing/deliveryStatusFromPct"
import { daysInMonth, formatIsoDate, parseIsoDate, type DateWindow } from "@/lib/webReport/periods"

import type { WebKpi, WebKpiActual, WebKpiTarget } from "./types"

/**
 * KPI pace bands. Status names (and so colours, via statusColours.ts) are the
 * dashboard's DeliveryStatus; the cut-offs are tighter than campaign pacing.
 * "no-data" means there is no target for the window, or no actual to compare.
 */
export const KPI_STATUS_THRESHOLDS = { behindBelowPct: 95, aheadFromPct: 105 } as const

export type KpiStatus = DeliveryStatus

export type WindowMonth = {
  /** First of the month, YYYY-MM-01. */
  month: string
  /** Days of the window that fall in this month. */
  days: number
  daysInMonth: number
}

export type KpiProgress = {
  /** Pro-rated target for the whole window; null when no month in it has a target. */
  target: number | null
  /** Pro-rated target from the window start to today (or the window end). */
  targetToDate: number | null
  /** Actual over the months that have a target, to date. */
  actualToDate: number | null
  /** actualToDate / targetToDate. Null when either is missing or the target to date is 0. */
  pace: number | null
  status: KpiStatus
  /** Months in the window with no target. They add nothing to the target or the actual. */
  monthsWithoutTarget: string[]
}

/** Calendar months a window touches, with the window's days in each. Empty when to < from. */
export function monthsInWindow(window: DateWindow): WindowMonth[] {
  const from = parseIsoDate(window.from)
  const to = parseIsoDate(window.to)
  if (!from || !to || window.to < window.from) return []
  const out: WindowMonth[] = []
  let y = from.y
  let m = from.m
  while (y < to.y || (y === to.y && m <= to.m)) {
    const total = daysInMonth(y, m)
    const firstDay = y === from.y && m === from.m ? from.d : 1
    const lastDay = y === to.y && m === to.m ? to.d : total
    out.push({ month: formatIsoDate(y, m, 1), days: lastDay - firstDay + 1, daysInMonth: total })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * Sum over each month of (month target x days of the window in that month /
 * days in the month). Months with no target are skipped. Null when none has one.
 */
export function proratedTarget(targets: readonly WebKpiTarget[], window: DateWindow): number | null {
  const byMonth = new Map(targets.map((item) => [item.month, item.target]))
  let sum: number | null = null
  for (const item of monthsInWindow(window)) {
    const target = byMonth.get(item.month)
    if (target == null) continue
    sum = (sum ?? 0) + (target * item.days) / item.daysInMonth
  }
  return sum == null ? null : roundMoney2(sum)
}

export function kpiStatus(pace: number | null): KpiStatus {
  if (pace == null || !Number.isFinite(pace)) return "no-data"
  const pct = pace * 100
  if (pct >= KPI_STATUS_THRESHOLDS.aheadFromPct) return "ahead"
  if (pct < KPI_STATUS_THRESHOLDS.behindBelowPct) return "behind"
  return "on-track"
}

/**
 * Progress for one KPI. today is the last day counted as elapsed (pass the
 * latest day with data when the source lags). Before the window starts there
 * is nothing to date and the status is no-data.
 */
export function kpiProgress(
  kpi: Pick<WebKpi, "targets">,
  actual: Pick<WebKpiActual, "total" | "months"> | null,
  window: DateWindow,
  today: string,
): KpiProgress {
  const targeted = new Set(kpi.targets.map((item) => item.month))
  const monthsWithoutTarget = monthsInWindow(window)
    .map((item) => item.month)
    .filter((month) => !targeted.has(month))
  const target = proratedTarget(kpi.targets, window)
  const toDateEnd = today < window.to ? today : window.to
  const toDate: DateWindow = { from: window.from, to: toDateEnd }
  const started = toDateEnd >= window.from
  const targetToDate = started ? proratedTarget(kpi.targets, toDate) : null

  let actualToDate: number | null = null
  if (actual?.total != null && target != null) {
    actualToDate = 0
    for (const item of actual.months) {
      if (targeted.has(item.month)) actualToDate += item.actual
    }
  }

  const pace =
    actualToDate != null && targetToDate != null && targetToDate > 0 ? actualToDate / targetToDate : null
  let status = kpiStatus(pace)
  if (pace == null && targetToDate === 0 && actualToDate != null) {
    status = actualToDate > 0 ? "ahead" : "on-track"
  }
  return { target, targetToDate, actualToDate, pace, status, monthsWithoutTarget }
}