/**
 * Australia/Sydney wall-clock helpers for PC5 cron guards.
 * Always compute the Sydney civil date/time — never trust UTC day-of-month alone.
 */

const SYDNEY_TZ = "Australia/Sydney"

export type SydneyWallClock = {
  /** YYYY-MM-DD in Sydney */
  ymd: string
  /** YYYY-MM */
  periodMonth: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** Last civil day of this Sydney month */
  lastDayOfMonth: number
  isLastDayOfMonth: boolean
}

function partsInSydney(instant: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 1-12; day 0 of next month = last day of this month (UTC math ok for length)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function getSydneyWallClock(now: Date = new Date()): SydneyWallClock {
  const p = partsInSydney(now)
  const last = lastDayOfMonth(p.year, p.month)
  const ymd = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
  return {
    ymd,
    periodMonth: `${p.year}-${String(p.month).padStart(2, "0")}`,
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    lastDayOfMonth: last,
    isLastDayOfMonth: p.day === last,
  }
}

/** Pre-run: 14th 06:00 Sydney (hour window 6 inclusive; minute any in that hour). */
export function isSydneyPreRunWindow(now: Date = new Date()): boolean {
  const c = getSydneyWallClock(now)
  return c.day === 14 && c.hour === 6
}

/** Run: 21st 06:00 Sydney. */
export function isSydneyRunWindow(now: Date = new Date()): boolean {
  const c = getSydneyWallClock(now)
  return c.day === 21 && c.hour === 6
}

/** Lock: last day 23:59 Sydney (minute >= 59 in hour 23). */
export function isSydneyLockWindow(now: Date = new Date()): boolean {
  const c = getSydneyWallClock(now)
  return c.isLastDayOfMonth && c.hour === 23 && c.minute >= 59
}

/**
 * Optional clock injection for local simulation:
 * `?now=2026-07-14T06:00:00+10:00` or header `x-finance-clock`.
 */
export function resolveInjectedNow(
  request: Request | null,
  fallback: Date = new Date()
): Date {
  if (!request) return fallback
  try {
    const url = new URL(request.url)
    const q = url.searchParams.get("now")
    if (q) {
      const d = new Date(q)
      if (!Number.isNaN(d.getTime())) return d
    }
  } catch {
    /* ignore */
  }
  const h = request.headers.get("x-finance-clock")
  if (h) {
    const d = new Date(h)
    if (!Number.isNaN(d.getTime())) return d
  }
  return fallback
}
