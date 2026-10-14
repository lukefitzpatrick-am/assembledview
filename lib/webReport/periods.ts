/**
 * Report windows. Dates are civil YYYY-MM-DD. The previous window is the
 * comparable period for the chosen default: the month before, the 28 days
 * before, or the same month last year.
 */

export const REPORT_PERIODS = ["last_month", "last_28_days", "month_to_date_yoy"] as const

export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export type DateWindow = { from: string; to: string }

export type ReportWindows = {
  period: ReportPeriod
  current: DateWindow
  previous: DateWindow
  /** Serif phrase after "Web & search", without the full stop. */
  phrase: string
  comparedWith: string
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = ISO.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

export function formatIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addIsoDays(iso: string, days: number): string {
  const parts = parseIsoDate(iso)
  if (!parts) throw new Error(`bad date ${iso}`)
  const utc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d))
  utc.setUTCDate(utc.getUTCDate() + days)
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

export function isReportPeriod(value: string | null | undefined): value is ReportPeriod {
  return REPORT_PERIODS.includes(value as ReportPeriod)
}

function monthName(iso: string): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  return `${MONTHS[parts.m - 1]} ${parts.y}`
}

function shortDate(iso: string): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  const mon = MONTHS[parts.m - 1]?.slice(0, 3) ?? ""
  return `${parts.d} ${mon} ${parts.y}`
}

function rangePhrase(window: DateWindow): string {
  if (window.from === window.to) return shortDate(window.from)
  return `${shortDate(window.from)} to ${shortDate(window.to)}`
}

export function resolveReportWindows(period: ReportPeriod, today: string): ReportWindows {
  const todayParts = parseIsoDate(today)
  if (!todayParts) throw new Error(`bad today ${today}`)

  if (period === "last_month") {
    const currentMonth = todayParts.m === 1 ? { y: todayParts.y - 1, m: 12 } : { y: todayParts.y, m: todayParts.m - 1 }
    const previousMonth =
      currentMonth.m === 1 ? { y: currentMonth.y - 1, m: 12 } : { y: currentMonth.y, m: currentMonth.m - 1 }
    const current = {
      from: formatIsoDate(currentMonth.y, currentMonth.m, 1),
      to: formatIsoDate(currentMonth.y, currentMonth.m, daysInMonth(currentMonth.y, currentMonth.m)),
    }
    const previous = {
      from: formatIsoDate(previousMonth.y, previousMonth.m, 1),
      to: formatIsoDate(previousMonth.y, previousMonth.m, daysInMonth(previousMonth.y, previousMonth.m)),
    }
    return {
      period,
      current,
      previous,
      phrase: monthName(current.from),
      comparedWith: monthName(previous.from),
    }
  }

  if (period === "last_28_days") {
    const current = { from: addIsoDays(today, -27), to: today }
    const previousTo = addIsoDays(current.from, -1)
    const previous = { from: addIsoDays(previousTo, -27), to: previousTo }
    return {
      period,
      current,
      previous,
      phrase: `28 days to ${shortDate(today)}`,
      comparedWith: rangePhrase(previous),
    }
  }

  const current = { from: formatIsoDate(todayParts.y, todayParts.m, 1), to: today }
  const prevYear = todayParts.y - 1
  const prevDay = Math.min(todayParts.d, daysInMonth(prevYear, todayParts.m))
  const previous = {
    from: formatIsoDate(prevYear, todayParts.m, 1),
    to: formatIsoDate(prevYear, todayParts.m, prevDay),
  }
  return {
    period,
    current,
    previous,
    phrase: monthName(current.from),
    comparedWith: rangePhrase(previous),
  }
}

export function dateInWindow(date: string, window: DateWindow): boolean {
  return date >= window.from && date <= window.to
}
