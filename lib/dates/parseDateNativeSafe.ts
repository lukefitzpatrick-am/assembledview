/**
 * Native-semantics safe date parser. Strings parse via the platform Date
 * constructor (plain YYYY-MM-DD => UTC midnight). Returns null for falsy/
 * invalid input. Valid Date inputs are cloned.
 *
 * NOTE: intentionally does NOT use parseDateOnlyString. For local date-only
 * preservation, use lib/dates/parseDateSafe instead.
 */
export function parseDateNativeSafe(value?: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value)
  }
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
