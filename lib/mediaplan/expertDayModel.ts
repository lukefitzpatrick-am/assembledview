import { eachDayOfInterval, format, startOfDay } from "date-fns"
import type { WeeklyGanttWeekColumn } from "@/lib/utils/weeklyGanttColumns"

export type DayKey = string // "yyyy-MM-dd" — a single campaign-clamped calendar day
export type ExpertDailyValues = Record<DayKey, number | "">

export interface DayColumn {
  dayKey: DayKey
  date: Date
  weekKey: string
  labelShort: string // e.g. "M 8"
}

export interface DayBurstWindow {
  startDate: Date
  endDate: Date
  qty: number
}

const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")

function clampDay(d: Date, lo: Date, hi: Date): Date {
  const t = startOfDay(d).getTime()
  if (t < startOfDay(lo).getTime()) return startOfDay(lo)
  if (t > startOfDay(hi).getTime()) return startOfDay(hi)
  return startOfDay(d)
}

function num(v: number | "" | undefined): number {
  return v === "" || v === undefined ? 0 : typeof v === "number" ? v : Number(v)
}

/** Campaign-clamped calendar days of a week column (1–7, Sun→Sat within campaign). */
export function buildDayColumnsForWeek(
  week: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date
): DayColumn[] {
  const lo = clampDay(week.weekStart, campaignStartDate, campaignEndDate)
  const hi = clampDay(week.weekEnd, campaignStartDate, campaignEndDate)
  if (startOfDay(hi).getTime() < startOfDay(lo).getTime()) return []
  return eachDayOfInterval({ start: lo, end: hi }).map((date) => ({
    dayKey: ymd(date),
    date: startOfDay(date),
    weekKey: week.weekKey,
    labelShort: format(date, "EEEEE d"),
  }))
}

export function weekDayKeys(
  week: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date
): DayKey[] {
  return buildDayColumnsForWeek(week, campaignStartDate, campaignEndDate).map((d) => d.dayKey)
}

/** True if the week carries any day-level value. */
export function weekHasDailyValues(daily: ExpertDailyValues, dayKeys: DayKey[]): boolean {
  return dayKeys.some((k) => daily[k] !== "" && daily[k] !== undefined)
}

/** Rule 1: a week collapses to ONE week burst iff every campaign-day shares the same value. */
export function weekIsUniform(daily: ExpertDailyValues, dayKeys: DayKey[]): boolean {
  if (dayKeys.length === 0) return true
  const first = num(daily[dayKeys[0]!])
  return dayKeys.every((k) => num(daily[k]) === first)
}

/** Rule 3: even split of a weekly qty across days, remainder to earliest days. */
export function expandWeekToDaily(weeklyValue: number | "", dayKeys: DayKey[]): ExpertDailyValues {
  const out: ExpertDailyValues = {}
  const total = num(weeklyValue)
  const n = dayKeys.length
  if (n === 0) return out
  const base = Math.floor(total / n)
  const remainder = total - base * n
  dayKeys.forEach((k, i) => {
    out[k] = i < remainder ? base + 1 : base
  })
  return out
}

/** Sum day values back to a single weekly qty; "" if all empty. */
export function collapseDailyToWeekly(daily: ExpertDailyValues, dayKeys: DayKey[]): number | "" {
  if (!weekHasDailyValues(daily, dayKeys)) return ""
  return dayKeys.reduce((s, k) => s + num(daily[k]), 0)
}

/**
 * If a burst window is confined to a strict subset of a week's campaign-days (day-detail),
 * return the covered day keys; else null (treat as a whole-week burst).
 * Returns null for ≤1-day weeks and for bursts covering the full campaign-clamped week.
 */
export function coveredDayKeysIfDayDetail(
  burstStart: Date,
  burstEnd: Date,
  week: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date
): DayKey[] | null {
  const dayCols = buildDayColumnsForWeek(week, campaignStartDate, campaignEndDate)
  if (dayCols.length <= 1) return null
  const bs = startOfDay(burstStart).getTime()
  const be = startOfDay(burstEnd).getTime()
  const covered = dayCols.filter((dc) => dc.date.getTime() >= bs && dc.date.getTime() <= be)
  if (covered.length === 0 || covered.length === dayCols.length) return null
  return covered.map((dc) => dc.dayKey)
}

/** Rule 2: burst windows for a day-detailed week — one per contiguous equal-valued run; gaps break runs. */
export function emitDayBurstsForWeek(
  dayColumns: DayColumn[],
  daily: ExpertDailyValues
): DayBurstWindow[] {
  const out: DayBurstWindow[] = []
  let runStart: DayColumn | null = null
  let runEnd: DayColumn | null = null
  let runVal = 0
  let runLen = 0
  const flush = () => {
    if (runStart && runEnd && runVal !== 0) {
      out.push({ startDate: runStart.date, endDate: runEnd.date, qty: runVal * runLen })
    }
    runStart = null
    runEnd = null
    runVal = 0
    runLen = 0
  }
  for (const col of dayColumns) {
    const v = num(daily[col.dayKey])
    if (v === 0) {
      flush()
    } else if (runStart && v === runVal) {
      runEnd = col
      runLen++
    } else {
      flush()
      runStart = col
      runEnd = col
      runVal = v
      runLen = 1
    }
  }
  flush()
  return out
}

/** Week-grained span-edge resize: grow/shrink a merged span by whole weeks, clamped. */
export function resizeSpanWeeks(
  weekKeysOrdered: readonly string[],
  startWeekKey: string,
  endWeekKey: string,
  edge: "start" | "end",
  deltaWeeks: number
): { startWeekKey: string; endWeekKey: string } | null {
  const si = weekKeysOrdered.indexOf(startWeekKey)
  const ei = weekKeysOrdered.indexOf(endWeekKey)
  if (si < 0 || ei < 0) return null
  let ns = si
  let ne = ei
  if (edge === "start") {
    ns = Math.min(Math.max(0, si + deltaWeeks), ei)
  } else {
    ne = Math.min(weekKeysOrdered.length - 1, ei + deltaWeeks)
    if (ne < si) return null
  }
  if (ns > ne) return null
  return { startWeekKey: weekKeysOrdered[ns]!, endWeekKey: weekKeysOrdered[ne]! }
}
