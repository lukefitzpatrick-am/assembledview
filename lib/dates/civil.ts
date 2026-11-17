/**
 * Civil calendar maths on strings: `YYYY-MM-DD` dates and `YYYY-MM` months.
 * A civil date has no time and no zone, so UTC arithmetic gives the calendar
 * answer with no daylight saving step. "Today" and "this month" come from
 * `./melbourne` (B49, S30).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Same acceptance as `Date.parse` on an ISO day: month 01 to 12, day 01 to 31 (31 Feb rolls on). */
const DAY_SHAPE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function utcMillis(iso: string): number {
  if (!DAY_SHAPE.test(iso)) throw new RangeError(`Invalid date: ${iso}`)
  const [y, m, d] = iso.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * A trimmed `YYYY-MM-DD` that is a real calendar date, else null.
 * `2026-02-30`, `2026-2-3` and timestamps are null.
 */
export function parseISODate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  const m = ISO_DATE.exec(text)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d ? text : null
}

/** `iso` moved by `days` calendar days. A malformed date throws a RangeError. */
export function addDaysISO(iso: string, days: number): string {
  return new Date(utcMillis(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole calendar days from `fromISO` to `toISO` (negative when `toISO` is earlier). A malformed date throws a RangeError. */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  return Math.round((utcMillis(toISO) - utcMillis(fromISO)) / 86_400_000)
}

/** `YYYY-MM` moved by `months` (negative goes back). */
export function addMonthsISO(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number)
  const idx = y * 12 + (m - 1) + months
  return `${Math.floor(idx / 12)}-${pad2((((idx % 12) + 12) % 12) + 1)}`
}

/** Last day of a `YYYY-MM` month as `YYYY-MM-DD`. The first day is `${month}-01`. */
export function monthEndISO(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return `${month}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/**
 * A `Date`'s own local calendar day as `YYYY-MM-DD` (date pickers and the
 * plan grids, which hold local-midnight `Date`s). Throws on an invalid `Date`.
 */
export function toDateOnlyString(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input provided to date-only helper")
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * A `YYYY-MM-DD` as a local-midnight `Date` (no zone shift), for date
 * pickers. Anything else goes to the native parser; invalid throws.
 */
export function parseDateOnlyString(value: string): Date {
  const match = ISO_DATE.exec(value)
  if (match) {
    const [, y, m, d] = match
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0)
  }
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date string provided to date-only parser")
  }
  return parsed
}
