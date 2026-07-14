/**
 * F-28 Phase 2 — OOH Expert grid virtualization helpers.
 *
 * Pure functions only: Apply / totals / drop-index math must never depend on
 * which rows are currently mounted in the DOM.
 */

import { expertGridParseNum } from "@/lib/mediaplan/expertGridShared"
import { expertRowCostSplit } from "@/lib/mediaplan/expertRowCost"
import type { OohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

/**
 * Fixed body-row height (px). Must match CSS `height` / `max-height` on each
 * schedule `<tr>` and `estimateSize` on the virtualizer — no measureElement.
 */
export const OOH_EXPERT_ROW_HEIGHT_PX = 41

/**
 * Default overscan for expert-grid body virtualization (F-28 Phase 2).
 * Shared across channels; OOH keeps {@link OOH_EXPERT_ROW_OVERSCAN} as an alias.
 */
export const EXPERT_GRID_ROW_OVERSCAN_DEFAULT = 12

/** Overscan keeps drag/keyboard neighbours mounted around the visible window. */
export const OOH_EXPERT_ROW_OVERSCAN = EXPERT_GRID_ROW_OVERSCAN_DEFAULT

/**
 * Map a Y offset (px from the start of the virtual body) to a logical row
 * index. Used for drag-reorder onto rows that are scrolled out of the mounted
 * window (spacers have no per-row drop handlers).
 */
export function virtualRowIndexFromOffsetY(
  offsetYInBody: number,
  rowHeightPx: number,
  rowCount: number
): number {
  if (rowCount <= 0 || rowHeightPx <= 0) return 0
  const idx = Math.floor(offsetYInBody / rowHeightPx)
  return Math.max(0, Math.min(rowCount - 1, idx))
}

/**
 * Expected mounted inclusive range for a fixed-size virtualizer (for DOM-count
 * constancy checks). Matches TanStack's range math with overscan.
 */
export function expectedMountedRowRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeightPx: number,
  rowCount: number,
  overscan: number,
  scrollMargin = 0
): { start: number; end: number } {
  if (rowCount <= 0 || rowHeightPx <= 0) return { start: 0, end: -1 }
  const adjusted = Math.max(0, scrollTop - scrollMargin)
  const start = Math.max(
    0,
    Math.floor(adjusted / rowHeightPx) - overscan
  )
  const end = Math.min(
    rowCount - 1,
    Math.ceil((adjusted + viewportHeight) / rowHeightPx) + overscan
  )
  return { start, end }
}

export function mountedRowCount(
  range: { start: number; end: number }
): number {
  if (range.end < range.start) return 0
  return range.end - range.start + 1
}

/**
 * Compute tbody spacer heights when item start/end include `scrollMargin`
 * (thead lives in the same scroller). Spacers only cover the virtual body.
 * Shared by {@link useExpertGridRowVirtualizer}.
 */
export function expertGridVirtualSpacerPaddings(
  virtualItems: readonly { start: number; end: number }[],
  totalSize: number,
  scrollMargin: number
): { paddingTop: number; paddingBottom: number } {
  if (virtualItems.length === 0) {
    return { paddingTop: 0, paddingBottom: 0 }
  }
  const first = virtualItems[0]!
  const last = virtualItems[virtualItems.length - 1]!
  return {
    paddingTop: Math.max(0, first.start - scrollMargin),
    paddingBottom: Math.max(0, totalSize + scrollMargin - last.end),
  }
}

export type OohExpertWeeklyTotals = {
  sumNet: number
  sumQty: number
  perWeek: Record<string, number>
  fee: number
  totalWithFee: number
}

/**
 * Weekly totals over the FULL logical rows array (never the virtual window).
 */
export function computeOohExpertWeeklyTotals(
  rows: readonly OohExpertScheduleRow[],
  weekKeys: readonly string[],
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  feePct: number
): OohExpertWeeklyTotals {
  let sumNet = 0
  let sumFee = 0
  let sumQty = 0
  const perWeek: Record<string, number> = {}
  for (const k of weekKeys) perWeek[k] = 0

  for (const row of rows) {
    const { net, fee } = expertRowCostSplit(row, weekKeys, feePct)
    sumNet += net
    sumFee += fee
    for (const k of weekKeys) {
      const q = expertGridParseNum(row.weeklyValues[k])
      perWeek[k] += q
      sumQty += q
    }
    if (row.dailyValues) {
      for (const k of weekKeys) {
        for (const dk of dayKeysByWeekKey[k] ?? []) {
          const dv = row.dailyValues[dk]
          if (dv === "" || dv === undefined) continue
          const q = expertGridParseNum(dv)
          perWeek[k] += q
          sumQty += q
        }
      }
    }
    for (const span of row.mergedWeekSpans ?? []) {
      const q = span.totalQty
      if (!Number.isFinite(q) || q === 0) continue
      if (span.startWeekKey in perWeek) {
        perWeek[span.startWeekKey] += q
      }
      sumQty += q
    }
  }

  return {
    sumNet,
    sumQty,
    perWeek,
    fee: sumFee,
    totalWithFee: sumNet + sumFee,
  }
}
