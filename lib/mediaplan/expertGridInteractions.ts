/** Pure: move rows[fromIndex] to toIndex. Returns a new array, or null on no-op / out-of-range (caller does nothing). */
export function reorderExpertRows<T>(rows: readonly T[], fromIndex: number, toIndex: number): T[] | null {
  if (fromIndex === toIndex) return null
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) return null
  const next = [...rows]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}
