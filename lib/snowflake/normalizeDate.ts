/**
 * Snowflake DATE columns hydrate as JS Date. `String(date).slice(0, 10)` is
 * `"Sat Sep 19"`, which never matches YYYY-MM-DD series keys.
 */
export function normalizeDailyFactDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromMs = new Date(value)
    return Number.isFinite(fromMs.getTime()) ? fromMs.toISOString().slice(0, 10) : null
  }
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoPrefix) return isoPrefix[1]
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}
