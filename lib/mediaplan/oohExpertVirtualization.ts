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
 * Shared across channels. Overscan keeps drag/keyboard neighbours mounted.
 */
export const EXPERT_GRID_ROW_OVERSCAN_DEFAULT = 12

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
    const contrib = oohExpertRowTotalsContribution(
      row,
      weekKeys,
      dayKeysByWeekKey,
      feePct
    )
    sumNet += contrib.sumNet
    sumFee += contrib.fee
    sumQty += contrib.sumQty
    for (const k of weekKeys) {
      perWeek[k] = (perWeek[k] ?? 0) + (contrib.perWeek[k] ?? 0)
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

/** One row's contribution to container weekly totals (Σqty / net / per-week). */
export function oohExpertRowTotalsContribution(
  row: OohExpertScheduleRow,
  weekKeys: readonly string[],
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  feePct: number
): OohExpertWeeklyTotals {
  const { net, fee } = expertRowCostSplit(row, weekKeys, feePct)
  let sumQty = 0
  const perWeek: Record<string, number> = {}
  for (const k of weekKeys) perWeek[k] = 0

  for (const k of weekKeys) {
    const q = expertGridParseNum(row.weeklyValues[k])
    perWeek[k] = (perWeek[k] ?? 0) + q
    sumQty += q
  }
  if (row.dailyValues) {
    for (const k of weekKeys) {
      for (const dk of dayKeysByWeekKey[k] ?? []) {
        const dv = row.dailyValues[dk]
        if (dv === "" || dv === undefined) continue
        const q = expertGridParseNum(dv)
        perWeek[k] = (perWeek[k] ?? 0) + q
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

  return {
    sumNet: net,
    sumQty,
    perWeek,
    fee,
    totalWithFee: net + fee,
  }
}

/** Apply ± one row contribution onto an existing totals object (immutable). */
export function applyOohWeeklyTotalsDelta(
  base: OohExpertWeeklyTotals,
  contrib: OohExpertWeeklyTotals,
  sign: 1 | -1,
  weekKeys: readonly string[]
): OohExpertWeeklyTotals {
  const perWeek: Record<string, number> = { ...base.perWeek }
  for (const k of weekKeys) {
    perWeek[k] = (perWeek[k] ?? 0) + sign * (contrib.perWeek[k] ?? 0)
  }
  const sumNet = base.sumNet + sign * contrib.sumNet
  const fee = base.fee + sign * contrib.fee
  const sumQty = base.sumQty + sign * contrib.sumQty
  return {
    sumNet,
    sumQty,
    perWeek,
    fee,
    totalWithFee: sumNet + fee,
  }
}

export type OohWeeklyTotalsCache = {
  rows: readonly OohExpertScheduleRow[]
  weekKeys: readonly string[]
  feePct: number
  totals: OohExpertWeeklyTotals
}

/**
 * Identity-preserving incremental totals: a single-cell edit (one new row
 * object) subtracts the old contribution and adds the new — O(changed) not O(n).
 * Falls back to a full recompute when week keys / fee / many rows change.
 */
export function computeOohExpertWeeklyTotalsIncremental(
  rows: readonly OohExpertScheduleRow[],
  weekKeys: readonly string[],
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  feePct: number,
  cache: OohWeeklyTotalsCache | null,
  maxChangedForIncremental = 8
): { totals: OohExpertWeeklyTotals; cache: OohWeeklyTotalsCache } {
  const weekKeysSame =
    !!cache &&
    cache.weekKeys === weekKeys &&
    cache.feePct === feePct

  if (!cache || !weekKeysSame) {
    const totals = computeOohExpertWeeklyTotals(
      rows,
      weekKeys,
      dayKeysByWeekKey,
      feePct
    )
    return { totals, cache: { rows, weekKeys, feePct, totals } }
  }

  const prev = cache.rows
  if (prev === rows) {
    return { totals: cache.totals, cache }
  }

  // Fast path: same length, find reference-changed slots.
  if (prev.length === rows.length) {
    const changed: number[] = []
    for (let i = 0; i < rows.length; i++) {
      if (prev[i] !== rows[i]) changed.push(i)
    }
    if (changed.length === 0) {
      return {
        totals: cache.totals,
        cache: { rows, weekKeys, feePct, totals: cache.totals },
      }
    }
    if (changed.length <= maxChangedForIncremental) {
      let totals = cache.totals
      for (const i of changed) {
        const oldRow = prev[i]
        const newRow = rows[i]
        if (oldRow) {
          totals = applyOohWeeklyTotalsDelta(
            totals,
            oohExpertRowTotalsContribution(
              oldRow,
              weekKeys,
              dayKeysByWeekKey,
              feePct
            ),
            -1,
            weekKeys
          )
        }
        if (newRow) {
          totals = applyOohWeeklyTotalsDelta(
            totals,
            oohExpertRowTotalsContribution(
              newRow,
              weekKeys,
              dayKeysByWeekKey,
              feePct
            ),
            1,
            weekKeys
          )
        }
      }
      return { totals, cache: { rows, weekKeys, feePct, totals } }
    }
  }

  // Length changed or too many edits — full recompute (still correct).
  const totals = computeOohExpertWeeklyTotals(
    rows,
    weekKeys,
    dayKeysByWeekKey,
    feePct
  )
  return { totals, cache: { rows, weekKeys, feePct, totals } }
}

/**
 * Default overscan for expert-grid COLUMN virtualization (OOH prototype).
 * Horizontal week window + overscan keeps merge/keyboard neighbours mounted.
 */
export const EXPERT_GRID_COL_OVERSCAN_DEFAULT = 4

/**
 * Cumulative left edges (px) for each week column, length = widths.length + 1
 * where the last entry is the total width of the week band.
 */
export function cumulativeColumnOffsets(
  widthsPx: readonly number[]
): number[] {
  const offsets = new Array<number>(widthsPx.length + 1)
  offsets[0] = 0
  for (let i = 0; i < widthsPx.length; i++) {
    offsets[i + 1] = offsets[i]! + Math.max(0, widthsPx[i] ?? 0)
  }
  return offsets
}

/**
 * Expected mounted inclusive week-column range for a fixed-width horizontal
 * virtualizer (TanStack-style range math with overscan).
 */
export function expectedMountedColRange(
  scrollLeft: number,
  viewportWidth: number,
  widthsPx: readonly number[],
  overscan: number
): { start: number; end: number } {
  const n = widthsPx.length
  if (n <= 0) return { start: 0, end: -1 }
  if (viewportWidth <= 0) {
    return {
      start: 0,
      end: Math.min(n - 1, overscan),
    }
  }
  const offsets = cumulativeColumnOffsets(widthsPx)
  const total = offsets[n]!
  const left = Math.max(0, Math.min(scrollLeft, total))
  const right = Math.max(left, Math.min(left + viewportWidth, total))

  let start = 0
  while (start < n && offsets[start + 1]! <= left) start += 1
  let end = n - 1
  while (end > 0 && offsets[end]! >= right) end -= 1

  start = Math.max(0, start - overscan)
  end = Math.min(n - 1, end + overscan)
  return { start, end }
}

export function mountedColCount(range: {
  start: number
  end: number
}): number {
  if (range.end < range.start) return 0
  return range.end - range.start + 1
}

/**
 * Left/right spacer widths (px) for unmounted week columns outside the
 * mounted inclusive range. Preserves total scroll width / sticky geometry.
 */
export function expertGridColSpacerWidths(
  range: { start: number; end: number },
  widthsPx: readonly number[]
): { paddingLeft: number; paddingRight: number } {
  const n = widthsPx.length
  if (n <= 0 || range.end < range.start) {
    const total = widthsPx.reduce((s, w) => s + Math.max(0, w), 0)
    return { paddingLeft: 0, paddingRight: total }
  }
  let paddingLeft = 0
  for (let i = 0; i < range.start; i++) paddingLeft += Math.max(0, widthsPx[i] ?? 0)
  let paddingRight = 0
  for (let i = range.end + 1; i < n; i++) {
    paddingRight += Math.max(0, widthsPx[i] ?? 0)
  }
  return { paddingLeft, paddingRight }
}

export type ExpertMergeSpanKeys = Readonly<{
  startWeekKey: string
  endWeekKey: string
}>

/**
 * Expand a mounted week range so any merge span that intersects the window
 * also includes its full week span (keeps colSpan anchors/interiors coherent).
 */
export function expandColRangeForMerges(
  range: { start: number; end: number },
  weekKeys: readonly string[],
  mergeSpans: readonly ExpertMergeSpanKeys[]
): { start: number; end: number } {
  if (range.end < range.start || weekKeys.length === 0) return range
  const keyIndex = new Map(weekKeys.map((k, i) => [k, i]))
  let start = range.start
  let end = range.end
  for (const span of mergeSpans) {
    const s = keyIndex.get(span.startWeekKey)
    const e = keyIndex.get(span.endWeekKey)
    if (s === undefined || e === undefined) continue
    const lo = Math.min(s, e)
    const hi = Math.max(s, e)
    if (hi < start || lo > end) continue
    start = Math.min(start, lo)
    end = Math.max(end, hi)
  }
  return {
    start: Math.max(0, start),
    end: Math.min(weekKeys.length - 1, end),
  }
}
