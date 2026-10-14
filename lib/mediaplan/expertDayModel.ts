import { eachDayOfInterval, format, startOfDay } from "date-fns"
import type { ExpertWeeklyValues } from "@/lib/mediaplan/expertModeWeeklySchedule"
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

function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return startOfDay(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

/**
 * Column whose week contains `date`. Bounds come from the columns, so the
 * match follows whatever weekStartsOn built them. A day before the first
 * column clamps to the first; a day after the last clamps to the last.
 */
export function weekColumnForDate(
  date: Date,
  weekColumns: readonly WeeklyGanttWeekColumn[]
): WeeklyGanttWeekColumn | null {
  if (weekColumns.length === 0) return null
  const day = startOfDay(date).getTime()
  const first = weekColumns[0]!
  const last = weekColumns[weekColumns.length - 1]!
  if (day < startOfDay(first.weekStart).getTime()) return first
  if (day > startOfDay(last.weekEnd).getTime()) return last
  for (const col of weekColumns) {
    if (
      day >= startOfDay(col.weekStart).getTime() &&
      day <= startOfDay(col.weekEnd).getTime()
    ) {
      return col
    }
  }
  return null
}

/** Whole units. The first `remainder` slots get one extra unit. */
function wholeUnitsByLargestRemainder(total: number, count: number): number[] {
  if (count <= 0 || !Number.isFinite(total)) return []
  const qty = Math.round(total)
  const base = Math.trunc(qty / count)
  const rem = qty - base * count
  const out = Array.from({ length: count }, () => base)
  const extra = Math.abs(rem)
  const step = rem > 0 ? 1 : rem < 0 ? -1 : 0
  for (let i = 0; i < extra; i++) out[i] += step
  return out
}

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

/**
 * Re-tile in-memory weeklyValues when weekStartsOn changes.
 * Each old week value is spread across campaign days inside that column
 * (whole units, largest remainder to the earliest days), then summed into
 * the new columns. Days outside the campaign window are not counted.
 * Empty grids (no numeric values) yield an empty record (no-op).
 */
export function rebucketWeeklyValues(
  weeklyValues: ExpertWeeklyValues,
  oldColumns: readonly WeeklyGanttWeekColumn[],
  newColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ExpertWeeklyValues {
  const dayAmounts = new Map<string, number>()
  let hasQty = false

  for (const col of oldColumns) {
    const qty = num(weeklyValues[col.weekKey])
    if (qty === 0) continue
    const days = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
    if (days.length === 0) continue
    hasQty = true
    const parts = wholeUnitsByLargestRemainder(qty, days.length)
    days.forEach((day, i) => {
      const add = parts[i] ?? 0
      if (add === 0) return
      dayAmounts.set(day.dayKey, (dayAmounts.get(day.dayKey) ?? 0) + add)
    })
  }

  if (!hasQty) return {}

  const out: ExpertWeeklyValues = {}
  for (const col of newColumns) {
    const days = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
    let sum = 0
    for (const day of days) sum += dayAmounts.get(day.dayKey) ?? 0
    out[col.weekKey] = sum === 0 ? "" : sum
  }

  return out
}

type RebucketSpan = {
  startWeekKey: string
  endWeekKey: string
  totalQty: number
  startYmd?: string
  endYmd?: string
}

function remapMergedSpan<S extends RebucketSpan>(
  span: S,
  oldColumns: readonly WeeklyGanttWeekColumn[],
  newColumns: readonly WeeklyGanttWeekColumn[]
): S {
  const dated =
    span.startYmd && span.endYmd
      ? { start: parseYmd(span.startYmd), end: parseYmd(span.endYmd) }
      : null
  const startColOld = oldColumns.find((c) => c.weekKey === span.startWeekKey)
  const endColOld = oldColumns.find((c) => c.weekKey === span.endWeekKey)
  const startDate = dated?.start ?? startColOld?.weekStart
  const endDate = dated?.end ?? endColOld?.weekEnd
  if (!startDate || !endDate) return span
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return span
  const startCol = weekColumnForDate(startDate, newColumns)
  const endCol = weekColumnForDate(endDate, newColumns)
  if (!startCol || !endCol) return span
  return {
    ...span,
    startWeekKey: startCol.weekKey,
    endWeekKey: endCol.weekKey,
  }
}

/**
 * Re-bucket every row when weekStartsOn changes.
 * A merged span stays one span: same totalQty and burst dates, with start and
 * end column keys moved onto the new grid. Plain weekly cells are re-tiled by
 * {@link rebucketWeeklyValues}.
 */
export function rebucketRowsForWeekStartsOn<
  R extends {
    weeklyValues: ExpertWeeklyValues
    mergedWeekSpans?: readonly RebucketSpan[] | null
  },
>(
  rows: readonly R[],
  oldColumns: readonly WeeklyGanttWeekColumn[],
  newColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): R[] {
  return rows.map((row) => {
    const nextWeekly = rebucketWeeklyValues(
      row.weeklyValues,
      oldColumns,
      newColumns,
      campaignStartDate,
      campaignEndDate
    )
    for (const c of newColumns) {
      if (!(c.weekKey in nextWeekly)) nextWeekly[c.weekKey] = ""
    }
    const mergedWeekSpans = row.mergedWeekSpans?.map((span) =>
      remapMergedSpan(span, oldColumns, newColumns)
    )
    return {
      ...row,
      weeklyValues: nextWeekly,
      ...(mergedWeekSpans ? { mergedWeekSpans } : {}),
    } as R
  })
}

function spanBurstRange(
  span: RebucketSpan,
  weekColumns: readonly WeeklyGanttWeekColumn[]
): { start: Date; end: Date } | null {
  if (span.startYmd && span.endYmd) {
    const start = parseYmd(span.startYmd)
    const end = parseYmd(span.endYmd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return start.getTime() <= end.getTime()
      ? { start, end }
      : { start: end, end: start }
  }
  const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
  const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
  if (!startCol || !endCol) return null
  const start = startOfDay(startCol.weekStart)
  const end = startOfDay(endCol.weekEnd)
  return start.getTime() <= end.getTime()
    ? { start, end }
    : { start: end, end: start }
}

/**
 * Display split of a span's quantity across the week columns it covers.
 * Units follow the burst's days inside each column. Does not change the span.
 */
export function spreadMergedSpanAcrossWeekColumns(
  span: RebucketSpan,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): Record<string, number> {
  if (!Number.isFinite(span.totalQty) || span.totalQty === 0 || weekColumns.length === 0) {
    return {}
  }
  const burst = spanBurstRange(span, weekColumns)
  if (!burst) return {}
  const start =
    burst.start.getTime() > startOfDay(campaignStartDate).getTime()
      ? burst.start
      : startOfDay(campaignStartDate)
  const end =
    burst.end.getTime() < startOfDay(campaignEndDate).getTime()
      ? burst.end
      : startOfDay(campaignEndDate)
  if (start.getTime() > end.getTime()) return {}
  const days = eachDayOfInterval({ start, end })
  if (days.length === 0) return {}
  const parts = wholeUnitsByLargestRemainder(span.totalQty, days.length)
  const out: Record<string, number> = {}
  days.forEach((day, i) => {
    const part = parts[i] ?? 0
    if (part === 0) return
    const col = weekColumnForDate(day, weekColumns)
    if (!col) return
    out[col.weekKey] = (out[col.weekKey] ?? 0) + part
  })
  return out
}
