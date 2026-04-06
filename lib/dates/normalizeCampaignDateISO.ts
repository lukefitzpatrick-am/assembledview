import { toMelbourneDateString } from "@/lib/timezone"

/**
 * Normalise campaign / API date fields to `YYYY-MM-DD` as a civil date in Australia/Melbourne
 * (matches mediaplans API `normalizeISODateOnlySafe` behaviour).
 */
export function normalizeDateToMelbourneISO(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return trimmed
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return null
    return toMelbourneDateString(d)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toMelbourneDateString(value)
  }
  const d = new Date(value as string | number)
  if (Number.isNaN(d.getTime())) return null
  return toMelbourneDateString(d)
}
