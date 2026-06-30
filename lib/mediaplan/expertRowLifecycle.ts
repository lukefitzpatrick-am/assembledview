/**
 * Shared row-lifecycle transforms for the 18 expert grids.
 * Pure array transforms only — callers own pushRows() and transient UI reset.
 * Behaviour-preserving extraction of the previously-inline duplicateRow/deleteRow.
 */

export type ExpertGridLifecycleRow = {
  id: string
  weeklyValues: Record<string, number | "">
  mergedWeekSpans?: Array<{ id: string }>
}

/**
 * Insert a duplicate of rows[rowIndex] immediately after it.
 * - regenerates the duplicate row id via makeRowId()
 * - shallow-copies weeklyValues (new object, same values)
 * - regenerates every mergedWeekSpans[].id via makeSpanId(index)
 * - preserves all other row/span fields by shallow spread
 * Returns null when rows[rowIndex] is missing (caller does nothing — no push/reset).
 */
export function duplicateExpertRow<T extends ExpertGridLifecycleRow>(
  rows: readonly T[],
  rowIndex: number,
  makeRowId: () => string,
  makeSpanId: (spanIndex: number) => string
): T[] | null {
  const source = rows[rowIndex]
  if (!source) return null

  const weeklyValues = { ...source.weeklyValues }
  const mergedWeekSpans = (source.mergedWeekSpans ?? []).map((span, i) => ({
    ...span,
    id: makeSpanId(i),
  }))

  // Single localized cast: the reconstructed object is the same runtime shape as
  // source (all original fields preserved by spread); the cast only re-narrows the
  // structurally-widened mergedWeekSpans element type back to T.
  const duplicate = {
    ...source,
    id: makeRowId(),
    weeklyValues,
    mergedWeekSpans,
  } as T

  return [
    ...rows.slice(0, rowIndex + 1),
    duplicate,
    ...rows.slice(rowIndex + 1),
  ]
}

/**
 * Remove rows[rowIndex]. Returns null when there is one row or fewer
 * (caller does nothing — no push/reset), matching current guarded behaviour.
 * No out-of-range guard is added: existing call sites pass valid indices and
 * adding one would be a behaviour change.
 */
export function deleteExpertRow<T>(
  rows: readonly T[],
  rowIndex: number
): T[] | null {
  if (rows.length <= 1) return null
  return rows.filter((_, i) => i !== rowIndex)
}
