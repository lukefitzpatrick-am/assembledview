import { parseDateOnlyString } from "@/lib/timezone"

/**
 * Safe date parser. Plain YYYY-MM-DD strings parse as local date-only via
 * parseDateOnlyString (no timezone shift). Returns null for falsy/invalid
 * input. Valid Date inputs are cloned.
 */
export function parseDateSafe(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value)
  }
  if (typeof value === "string") {
    try {
      return parseDateOnlyString(value)
    } catch {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
