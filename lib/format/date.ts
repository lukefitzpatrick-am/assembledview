import { parseDateSafe } from "@/lib/dates/parseDateSafe"

const LOCALE = "en-AU"

export type DateInput = Date | string | null | undefined

function toDate(value: DateInput): Date | null {
  return parseDateSafe(value)
}

/**
 * Short calendar date for tables, cards, and lists — e.g. "1 Apr 2026".
 * Returns "—" for null/undefined/unparseable input.
 */
export function formatDateShort(d: DateInput): string {
  const date = toDate(d)
  if (!date) return "—"
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

/**
 * Long calendar date for page headers and prose — e.g. "1 April 2026".
 * Returns "—" for null/undefined/unparseable input.
 */
export function formatDateLong(d: DateInput): string {
  const date = toDate(d)
  if (!date) return "—"
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

/**
 * Inclusive date range with shared year/month collapsed — e.g. "1 Apr – 31 Dec 2026".
 * Returns "—" if either bound is unparseable.
 */
export function formatDateRange(a: DateInput, b: DateInput): string {
  const start = toDate(a)
  const end = toDate(b)
  if (!start || !end) return "—"

  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    const dayStart = new Intl.DateTimeFormat(LOCALE, { day: "numeric" }).format(start)
    const endLabel = new Intl.DateTimeFormat(LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(end)
    return `${dayStart} – ${endLabel}`
  }

  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat(LOCALE, {
      day: "numeric",
      month: "short",
    }).format(start)
    const endLabel = new Intl.DateTimeFormat(LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(end)
    return `${startLabel} – ${endLabel}`
  }

  return `${formatDateShort(start)} – ${formatDateShort(end)}`
}
