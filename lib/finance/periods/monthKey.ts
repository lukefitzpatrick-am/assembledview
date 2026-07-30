/**
 * PC5 / C-14 — month keys normalise to YYYY-MM at every boundary.
 */

const ISO_MONTH_RE = /^\d{4}-\d{2}$/
const MONTH_YEAR_RE =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

/** Canonical period key: YYYY-MM. Throws on unparseable input. */
export function toPeriodMonthKey(input: string | Date): string {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("Invalid Date for period month")
    const y = input.getUTCFullYear()
    const m = input.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, "0")}`
  }
  const raw = String(input ?? "").trim()
  if (!raw) throw new Error("Empty period month")

  if (ISO_MONTH_RE.test(raw)) return raw

  // date-only or timestamptz first-of-month
  const dateOnly = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly.slice(0, 7)

  const my = raw.match(MONTH_YEAR_RE)
  if (my) {
    const idx = MONTH_INDEX[my[1]!.toLowerCase()]
    if (!idx) throw new Error(`Invalid month label: ${raw}`)
    return `${my[2]}-${String(idx).padStart(2, "0")}`
  }

  throw new Error(`Cannot normalise period month: ${raw}`)
}

/** First-of-month date string YYYY-MM-01 for Postgres `date` columns. */
export function toPeriodMonthDate(input: string | Date): string {
  return `${toPeriodMonthKey(input)}-01`
}

export function periodMonthKeyFromDate(d: Date): string {
  return toPeriodMonthKey(d)
}

export function addPeriodMonths(yyyyMm: string, delta: number): string {
  const key = toPeriodMonthKey(yyyyMm)
  const [ys, ms] = key.split("-")
  const y = Number(ys)
  const m = Number(ms)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}
