import { daysInMonth, formatIsoDate, parseIsoDate } from "@/lib/webReport/periods"

import { kpiProgress, type KpiStatus } from "./progress"
import type { WebKpi, WebKpiActual, WebKpiTarget } from "./types"

export const TARGET_GRID_MONTHS = 12

/** Month input text keyed by YYYY-MM-01. Blank means "leave as it is". */
export type TargetDraft = Record<string, string>

function monthStart(today: string): { y: number; m: number } | null {
  const parsed = parseIsoDate(today)
  return parsed ? { y: parsed.y, m: parsed.m } : null
}

function shift(y: number, m: number, delta: number): string {
  const index = y * 12 + (m - 1) + delta
  return formatIsoDate(Math.floor(index / 12), (index % 12) + 1, 1)
}

/** The 12 months from today's month, oldest first. */
export function forwardMonths(today: string): string[] {
  const start = monthStart(today)
  if (!start) return []
  return Array.from({ length: TARGET_GRID_MONTHS }, (_, index) => shift(start.y, start.m, index))
}

/** The 12 months before today's month, oldest first. */
export function previousMonths(today: string): string[] {
  const start = monthStart(today)
  if (!start) return []
  return Array.from({ length: TARGET_GRID_MONTHS }, (_, index) => shift(start.y, start.m, index - TARGET_GRID_MONTHS))
}

/** This month as a window from its first day to its last. */
export function currentMonthWindow(today: string): { from: string; to: string } {
  const start = monthStart(today)
  if (!start) return { from: today, to: today }
  return {
    from: formatIsoDate(start.y, start.m, 1),
    to: formatIsoDate(start.y, start.m, daysInMonth(start.y, start.m)),
  }
}

export function draftFromTargets(targets: readonly WebKpiTarget[]): TargetDraft {
  const out: TargetDraft = {}
  for (const item of targets) out[item.month] = String(item.target)
  return out
}

/** Sets every listed month to the first month's value. A blank first month changes nothing. */
export function copyToAll(draft: TargetDraft, months: readonly string[]): TargetDraft {
  const source = months[0] ? draft[months[0]]?.trim() : ""
  if (!source) return draft
  const next = { ...draft }
  for (const month of months) next[month] = source
  return next
}

/**
 * Each month after the first is the month before plus pct%, compounding and
 * rounded to a whole number. The first month must hold a number.
 */
export function increaseEachMonth(draft: TargetDraft, months: readonly string[], pct: number): TargetDraft {
  const first = months[0]
  const base = first ? Number(draft[first]) : Number.NaN
  if (!first || !draft[first]?.trim() || !Number.isFinite(base) || !Number.isFinite(pct)) return draft
  const next = { ...draft }
  let value = base
  for (const month of months.slice(1)) {
    value *= 1 + pct / 100
    next[month] = String(Math.round(value))
  }
  return next
}

/** Filled months only, as numbers. Blank months are left out so their saved targets stay. */
export function targetsFromDraft(
  draft: TargetDraft,
): { ok: true; targets: WebKpiTarget[] } | { ok: false; error: string } {
  const targets: WebKpiTarget[] = []
  for (const month of Object.keys(draft).sort()) {
    const raw = draft[month]?.trim()
    if (!raw) continue
    const target = Number(raw)
    if (!Number.isFinite(target) || target < 0) {
      return { ok: false, error: `The target for ${month.slice(0, 7)} must be 0 or more` }
    }
    targets.push({ month, target })
  }
  return { ok: true, targets }
}

export type KpiEditorRow = WebKpi & {
  monthTarget: number | null
  monthActual: number | null
  monthStatus: KpiStatus
}

/** List rows for the editor: this month's target, actual to date and status. Inactive KPIs have no actual. */
export function kpiEditorRows(kpis: readonly WebKpi[], actuals: readonly WebKpiActual[], today: string): KpiEditorRow[] {
  const window = currentMonthWindow(today)
  const byKpi = new Map(actuals.map((row) => [row.kpiId, row]))
  return kpis.map((kpi) => {
    const actual = kpi.active ? (byKpi.get(kpi.id) ?? null) : null
    const monthTarget = kpi.targets.find((item) => item.month === window.from)?.target ?? null
    const progress = kpi.active ? kpiProgress(kpi, actual, window, today) : null
    return {
      ...kpi,
      monthTarget,
      monthActual: actual?.total ?? null,
      monthStatus: progress?.status ?? "no-data",
    }
  })
}
