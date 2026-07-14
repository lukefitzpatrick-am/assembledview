"use client"

import { memo, type ReactNode } from "react"

export type MemoExpertGridRowProps<TRow, TMap> = {
  row: TRow
  rowIndex: number
  rowMergeMap: TMap
  /** Campaign/layout fingerprint shared by all rows (entry mode, expanded weeks, widths…). */
  layoutSig: string
  /** Per-row UI fingerprint (drag hover, selection, focus, budget draft…). */
  rowUiSig: string
  render: (row: TRow, rowIndex: number, rowMergeMap: TMap) => ReactNode
}

/**
 * Memoised expert-grid row shell (F-28 Phase 1).
 *
 * Skips re-render when this row's data, merge map, index, and UI fingerprints
 * are unchanged — even if the parent re-rendered because a sibling changed.
 * `render` is intentionally excluded from the comparison; handlers used inside
 * `render` must read latest functions via refs so skipped rows stay correct.
 */
function MemoExpertGridRowInner<TRow, TMap>({
  row,
  rowIndex,
  rowMergeMap,
  render,
}: MemoExpertGridRowProps<TRow, TMap>) {
  return <>{render(row, rowIndex, rowMergeMap)}</>
}

function propsAreEqual<TRow, TMap>(
  prev: Readonly<MemoExpertGridRowProps<TRow, TMap>>,
  next: Readonly<MemoExpertGridRowProps<TRow, TMap>>
): boolean {
  return (
    prev.row === next.row &&
    prev.rowMergeMap === next.rowMergeMap &&
    prev.rowIndex === next.rowIndex &&
    prev.layoutSig === next.layoutSig &&
    prev.rowUiSig === next.rowUiSig
  )
}

export const MemoExpertGridRow = memo(
  MemoExpertGridRowInner,
  propsAreEqual
) as typeof MemoExpertGridRowInner
