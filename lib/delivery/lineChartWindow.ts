import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"

/**
 * Date window for the daily delivery charts.
 *
 * Every line chart runs from the line's first burst start to today
 * (Melbourne), or to the line's last burst end once the line has finished.
 * A date filter narrows that window. Missing days are zero-filled.
 *
 * All maths is on `YYYY-MM-DD` strings. No `Date` round trips through
 * `toISOString`, which shift a day in Australian browsers.
 */

export type LineChartDates = { startISO: string | null; endISO: string | null }
export type ChartDateFilter = { start: Date | null; end: Date | null }
export type ChartWindow = { from: string; to: string }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
/** Hard stop on filled days so a bad date can never build a huge array. */
const MAX_DAYS = 1500

export function isoDay(value: unknown): string | null {
  const text = String(value ?? "").trim()
  const m = text.match(ISO_DAY)
  return m ? m[0] : null
}

export function addDaysISO(iso: string, days: number): string {
  const [y, mo, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function isoDayList(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = from
  while (cursor <= to && out.length < MAX_DAYS) {
    out.push(cursor)
    cursor = addDaysISO(cursor, 1)
  }
  return out
}

/** Calendar day of a local `Date` (the URL filter parses `YYYY-MM-DD` as local midnight). */
export function localDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Earliest burst start and latest burst end, falling back to the given dates. */
export function lineDatesFromBursts(raw: unknown, fallback: LineChartDates): LineChartDates {
  const bursts = parseBurstsToNormalised(raw)
  let startISO: string | null = null
  let endISO: string | null = null
  for (const b of bursts) {
    const s = isoDay(b.startDate)
    const e = isoDay(b.endDate)
    if (s && (!startISO || s < startISO)) startISO = s
    if (e && (!endISO || e > endISO)) endISO = e
  }
  return {
    startISO: startISO ?? isoDay(fallback.startISO),
    endISO: endISO ?? isoDay(fallback.endISO),
  }
}

/**
 * `from` = line start, `to` = the earlier of today and line end, both narrowed
 * by the filter. `from > to` means nothing to plot (not started, or filtered out).
 * Null when the line has no usable dates.
 */
export function chartWindow(
  dates: LineChartDates,
  opts: { todayISO: string; filter?: ChartDateFilter | null },
): ChartWindow | null {
  const start = isoDay(dates.startISO)
  const end = isoDay(dates.endISO)
  if (!start || !end) return null
  let from = start
  let to = end < opts.todayISO ? end : opts.todayISO
  const f = opts.filter
  if (f?.start && f?.end) {
    const fs = localDateISO(f.start)
    const fe = localDateISO(f.end)
    if (fs > from) from = fs
    if (fe < to) to = fe
  }
  return { from, to }
}

type Row = Record<string, string | number>

/**
 * Rows inside the window, one per day, missing days zero-filled on `keys`.
 * Returns [] when the window is empty or every value is zero, so the chart
 * keeps its "Starts …" / "Awaiting first report" state.
 */
export function fitDailyRows(rows: Row[], window: ChartWindow, keys: string[]): Row[] {
  if (window.from > window.to) return []
  const byDate = new Map<string, Row>()
  for (const row of rows) {
    const day = isoDay(row.date)
    if (!day || day < window.from || day > window.to) continue
    const existing = byDate.get(day)
    if (!existing) {
      byDate.set(day, { ...row, date: day })
      continue
    }
    for (const key of keys) {
      const add = Number(row[key] ?? 0)
      existing[key] = Number(existing[key] ?? 0) + (Number.isFinite(add) ? add : 0)
    }
  }
  const out = isoDayList(window.from, window.to).map((day) => {
    const found = byDate.get(day)
    if (found) return found
    const zero: Row = { date: day }
    for (const key of keys) zero[key] = 0
    return zero
  })
  const hasValue = out.some((row) => keys.some((key) => Number(row[key] ?? 0) !== 0))
  return hasValue ? out : []
}
