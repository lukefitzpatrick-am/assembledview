/**
 * Burst calendar-day helpers anchored to Australia/Sydney.
 *
 * Write and read both convert through Sydney civil dates so AEST/AEDT
 * clients and UTC servers agree. Downstream code should use getFullYear /
 * getMonth / getDate on the Date returned by {@link parseBurstDateLocal}.
 */

const SYDNEY_TZ = "Australia/Sydney"
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

const sydneyYmdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SYDNEY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function toSydneyYmd(instant: Date): string {
  // en-CA + numeric/2-digit parts → YYYY-MM-DD
  return sydneyYmdFormatter.format(instant)
}

/**
 * Format a burst date for persist as YYYY-MM-DD in Australia/Sydney.
 * Already-clean calendar strings pass through unchanged.
 */
export function formatBurstDateLocal(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return ""
    if (DATE_ONLY_RE.test(trimmed)) return trimmed
    const instant = new Date(trimmed)
    if (Number.isNaN(instant.getTime())) return ""
    return toSydneyYmd(instant)
  }
  if (Number.isNaN(value.getTime())) return ""
  return toSydneyYmd(value)
}

/**
 * Parse a persisted burst date into a local-midnight Date for Y/M/D math.
 * - `YYYY-MM-DD` → that civil day
 * - Instant strings (e.g. `…T…Z`) → Sydney calendar day of that instant, then local midnight
 */
export function parseBurstDateLocal(value: string): Date {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Empty burst date string")
  }

  let ymd = trimmed
  if (!DATE_ONLY_RE.test(trimmed)) {
    const instant = new Date(trimmed)
    if (Number.isNaN(instant.getTime())) {
      throw new Error(`Invalid burst date string: ${value}`)
    }
    ymd = toSydneyYmd(instant)
  }

  const [ys, ms, ds] = ymd.split("-")
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid burst date string: ${value}`)
  }
  return new Date(y, m - 1, d)
}

/**
 * Coerce a burst date (Date | string) to local-midnight via the same Sydney
 * civil-day rules as {@link parseBurstDateLocal}. Returns null for empty/invalid.
 */
export function coerceBurstDateLocal(
  value: Date | string | null | undefined
): Date | null {
  if (value == null) return null
  try {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null
      return parseBurstDateLocal(formatBurstDateLocal(value))
    }
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed) return null
      return parseBurstDateLocal(trimmed)
    }
  } catch {
    return null
  }
  return null
}
