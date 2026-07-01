import { WEEK_COL_WIDTH_PX, weekKeysInSpanInclusive } from "@/lib/mediaplan/expertGridShared"

/** Pure: move rows[fromIndex] to toIndex. Returns a new array, or null on no-op / out-of-range (caller does nothing). */
export function reorderExpertRows<T>(rows: readonly T[], fromIndex: number, toIndex: number): T[] | null {
  if (fromIndex === toIndex) return null
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) return null
  const next = [...rows]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export const EXPERT_WEEK_COL_MIN_PX = 48
export const EXPERT_WEEK_COL_MAX_PX = 400

/** Layout style for a week column, honouring a session width override. */
export function weekColStyle(weekKey: string, widths?: Record<string, number>) {
  const w = widths?.[weekKey] ?? WEEK_COL_WIDTH_PX
  return { width: w, minWidth: w, maxWidth: w, boxSizing: "border-box" as const }
}

/** Total px width of a merged span = sum of its constituent week widths (NOT default × spanLen). */
export function mergedSpanWidthPx(
  weekKeysOrdered: readonly string[],
  startWeekKey: string,
  endWeekKey: string,
  widths?: Record<string, number>,
): number {
  const keys = weekKeysInSpanInclusive(weekKeysOrdered, startWeekKey, endWeekKey)
  if (keys.length === 0) return WEEK_COL_WIDTH_PX
  return keys.reduce((sum, k) => sum + (widths?.[k] ?? WEEK_COL_WIDTH_PX), 0)
}
