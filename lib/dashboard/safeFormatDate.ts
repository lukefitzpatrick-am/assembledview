import { format } from "date-fns"

/**
 * Client-facing date label that never throws on blank/malformed input.
 * One bad record must not take the page to the error boundary.
 */
export function safeFormatDate(
  dateString: string | null | undefined,
  pattern = "MMM d, yyyy",
  fallback = "—",
): string {
  if (typeof dateString !== "string" || !dateString.trim()) return fallback
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return fallback
  try {
    return format(d, pattern)
  } catch {
    return fallback
  }
}
