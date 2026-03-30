/**
 * Shared selection, paste, merge, copy/cut/export, and outline helpers for expert weekly grids.
 * Row types are parameterized via {@link ExpertGridRowWithWeekly}.
 */

import {
  differenceInCalendarDays,
  parse as parseDateFns,
  startOfDay,
} from "date-fns"

import { cn } from "@/lib/utils"
import type { ExpertWeeklyValues } from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  parseDatePasteValue,
  parseWeeklyPasteValue,
  rowHasNumericWeekPasteCell,
} from "@/lib/mediaplan/expertGridPaste"
import { weekKeysInSpanInclusive } from "@/lib/mediaplan/expertOohRadioMappings"
import type { WeeklyGanttWeekColumn } from "@/lib/utils/weeklyGanttColumns"

/** Non-editable columns between last descriptor and first week (gross, actions, Σ qty). */
export const WEEK_GRID_COL_OFFSET = 3

/** Fixed width (px) for each Gantt week column. */
export const WEEK_COL_WIDTH_PX = 112

/** Right edge of sticky block before the horizontally scrolling week area. */
export const WEEK_SCROLLER_EDGE =
  "border-r-2 border-border/80 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)] dark:shadow-[2px_0_8px_-4px_rgba(0,0,0,0.22)]"

export const WEEK_CELL_VISUAL_CLASSES = {
  mergedSurface:
    "relative h-full min-h-8 w-full min-w-0 overflow-hidden rounded-md border border-violet-600/80 bg-violet-500/[0.28] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(16,24,40,0.18)] transition-[color,background-color,box-shadow] hover:bg-violet-500/[0.29] focus-within:bg-violet-500/[0.29] focus-within:ring-1 focus-within:ring-inset focus-within:ring-violet-500/55 dark:border-violet-400/80 dark:bg-violet-500/[0.26] dark:hover:bg-violet-500/[0.27] dark:focus-within:bg-violet-500/[0.27] dark:focus-within:ring-violet-400/55",
  mergedInput:
    "box-border min-h-8 h-full w-full max-w-none border-0 bg-transparent py-0 pl-2 pr-10 text-center text-[11px] tabular-nums font-semibold leading-8 text-violet-950 shadow-none ring-0 outline-none dark:text-violet-100 focus-visible:ring-0 focus-visible:ring-offset-0",
  populatedSingleTd: "bg-blue-500/10 dark:bg-blue-400/16",
} as const

export const WEEK_PASTE_NEAREST_START_TOLERANCE_DAYS = 4

export type ExpertGridMergeSpan = Readonly<{
  id: string
  startWeekKey: string
  endWeekKey: string
  totalQty: number
}>

export type ExpertGridRowWithWeekly = Readonly<{
  weeklyValues: ExpertWeeklyValues
  mergedWeekSpans?: readonly ExpertGridMergeSpan[] | undefined
}>

export type ExpertRowMergeMap = Readonly<{
  spanById: Readonly<Record<string, ExpertGridMergeSpan>>
}>

export type ExpertWeekRectSelection = Readonly<{
  rowStart: number
  rowEnd: number
  weekKeyStart: string
  weekKeyEnd: string
}>

export type ExpertMultiCellSelection = Readonly<{
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}>

export type WeeklySelectionBounds = Readonly<{
  rowStart: number
  rowEnd: number
  wi0: number
  wi1: number
}>

export type WeeklyPasteLayoutMode = "tile" | "clip" | "direct"

export type WeeklyExportSelection =
  | { kind: "rect"; rect: ExpertWeekRectSelection }
  | { kind: "strip"; rowIndex: number }
  | { kind: "mergeContiguous"; rowIndex: number; weekKeys: readonly string[] }
  | { kind: "focusedWeekCell"; rowIndex: number; weekKey: string }

export type WeekMergeSelectionNormalized = Readonly<{
  rowIndex: number
  orderedWeekKeys: string[]
  anchorWeekKey: string
}>

export type SelectionOutlineFlags = Readonly<{
  inRange: boolean
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}>

export function expertGridParseNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function normalizeWeekValueForExpertGridBoundary(
  v: number | string | undefined | null
): number | "" {
  if (v === undefined || v === null) return ""
  if (typeof v === "number") return v === 0 ? "" : v
  const trimmed = v.trim()
  if (trimmed === "") return ""
  const n = Number(trimmed)
  if (Number.isFinite(n) && n === 0) return ""
  return Number.isFinite(n) ? n : ""
}

export function findMergedSpanForWeek<R extends ExpertGridRowWithWeekly>(
  row: R,
  weekKey: string,
  order: readonly string[]
): ExpertGridMergeSpan | null {
  for (const span of row.mergedWeekSpans ?? []) {
    const keys = weekKeysInSpanInclusive(order, span.startWeekKey, span.endWeekKey)
    if (keys.includes(weekKey)) return span
  }
  return null
}

export function weekCellIsPopulated<R extends ExpertGridRowWithWeekly>(
  row: R,
  weekKey: string,
  order: readonly string[]
): boolean {
  const span = findMergedSpanForWeek(row, weekKey, order)
  if (span) {
    return Number.isFinite(span.totalQty) && span.totalQty !== 0
  }
  const v = row.weeklyValues[weekKey]
  if (v === "" || v === undefined || v === null) return false
  const n = expertGridParseNum(v)
  return Number.isFinite(n) && n !== 0
}

export function weeklyCellDisplayValue(
  cellValue: number | string | undefined,
  mergedSpan: ExpertGridMergeSpan | null
): string {
  if (mergedSpan) {
    return mergedSpan.totalQty === 0 ? "" : String(mergedSpan.totalQty)
  }
  if (cellValue === "" || cellValue === undefined || cellValue === null) return ""
  if (typeof cellValue === "number") return cellValue === 0 ? "" : String(cellValue)
  const trimmed = cellValue.trim()
  if (trimmed === "") return ""
  const n = Number(trimmed)
  if (Number.isFinite(n) && n === 0) return ""
  return String(cellValue)
}

export function sortWeekKeysByTimeline(
  keys: string[],
  order: readonly string[]
): string[] {
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function weekKeysAreContiguous(
  sortedKeys: string[],
  order: readonly string[]
): boolean {
  if (sortedKeys.length < 2) return false
  const idx = sortedKeys.map((k) => order.indexOf(k))
  if (idx.some((i) => i < 0)) return false
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1]! + 1) return false
  }
  return true
}

export function selectionOverlapsMergedSpan(
  rowMergeMap: ExpertRowMergeMap | undefined,
  selectedKeys: readonly string[],
  weekKeys: readonly string[]
): boolean {
  if (!rowMergeMap || selectedKeys.length === 0) return false
  const selected = new Set(selectedKeys)
  for (const span of Object.values(rowMergeMap.spanById)) {
    for (const k of weekKeysInSpanInclusive(
      weekKeys,
      span.startWeekKey,
      span.endWeekKey
    )) {
      if (selected.has(k)) return true
    }
  }
  return false
}

export function normalizeWeekRect(
  row0: number,
  wk0: string,
  row1: number,
  wk1: string,
  weekKeys: readonly string[]
): ExpertWeekRectSelection {
  const r0 = Math.min(row0, row1)
  const r1 = Math.max(row0, row1)
  const i0 = weekKeys.indexOf(wk0)
  const i1 = weekKeys.indexOf(wk1)
  const a = Math.min(i0, i1)
  const b = Math.max(i0, i1)
  return {
    rowStart: r0,
    rowEnd: r1,
    weekKeyStart: weekKeys[a]!,
    weekKeyEnd: weekKeys[b]!,
  }
}

export function weekCellInRect(
  rowIndex: number,
  weekKey: string,
  rect: ExpertWeekRectSelection | null,
  weekKeys: readonly string[]
): boolean {
  if (!rect) return false
  if (rowIndex < rect.rowStart || rowIndex > rect.rowEnd) return false
  const i = weekKeys.indexOf(weekKey)
  const i0 = weekKeys.indexOf(rect.weekKeyStart)
  const i1 = weekKeys.indexOf(rect.weekKeyEnd)
  const lo = Math.min(i0, i1)
  const hi = Math.max(i0, i1)
  return i >= lo && i <= hi
}

export function rectToMultiCellSelection(
  rect: ExpertWeekRectSelection | null,
  weekKeys: readonly string[]
): ExpertMultiCellSelection | null {
  if (!rect) return null
  const i0 = weekKeys.indexOf(rect.weekKeyStart)
  const i1 = weekKeys.indexOf(rect.weekKeyEnd)
  if (i0 < 0 || i1 < 0) return null
  return {
    startRow: Math.min(rect.rowStart, rect.rowEnd),
    endRow: Math.max(rect.rowStart, rect.rowEnd),
    startCol: Math.min(i0, i1),
    endCol: Math.max(i0, i1),
  }
}

export function selectionBoundsFromWeeklyExportSelection(
  selection: WeeklyExportSelection,
  weekKeys: readonly string[]
): ExpertMultiCellSelection | null {
  switch (selection.kind) {
    case "rect":
      return rectToMultiCellSelection(selection.rect, weekKeys)
    case "strip":
      if (weekKeys.length === 0) return null
      return {
        startRow: selection.rowIndex,
        endRow: selection.rowIndex,
        startCol: 0,
        endCol: weekKeys.length - 1,
      }
    case "mergeContiguous": {
      if (selection.weekKeys.length === 0) return null
      const ordered = sortWeekKeysByTimeline([...selection.weekKeys], weekKeys)
      const i0 = weekKeys.indexOf(ordered[0]!)
      const i1 = weekKeys.indexOf(ordered[ordered.length - 1]!)
      if (i0 < 0 || i1 < 0) return null
      return {
        startRow: selection.rowIndex,
        endRow: selection.rowIndex,
        startCol: Math.min(i0, i1),
        endCol: Math.max(i0, i1),
      }
    }
    case "focusedWeekCell": {
      const wi = weekKeys.indexOf(selection.weekKey)
      if (wi < 0) return null
      return {
        startRow: selection.rowIndex,
        endRow: selection.rowIndex,
        startCol: wi,
        endCol: wi,
      }
    }
    default:
      return null
  }
}

export function coerceWeeklySelectionBounds(
  anchorRow: number,
  anchorWeekKey: string,
  weekRectSelection: ExpertWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  weekMultiSelect: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): WeeklySelectionBounds | null {
  const awi = weekKeys.indexOf(anchorWeekKey)
  if (awi < 0) return null

  if (
    weekRectSelection &&
    weekCellInRect(anchorRow, anchorWeekKey, weekRectSelection, weekKeys)
  ) {
    const i0 = weekKeys.indexOf(weekRectSelection.weekKeyStart)
    const i1 = weekKeys.indexOf(weekRectSelection.weekKeyEnd)
    const wi0 = Math.min(i0, i1)
    const wi1 = Math.max(i0, i1)
    if (wi0 < 0 || wi1 < 0) return null
    return {
      rowStart: weekRectSelection.rowStart,
      rowEnd: weekRectSelection.rowEnd,
      wi0,
      wi1,
    }
  }

  if (weekStripSelection && anchorRow === weekStripSelection.rowIndex) {
    return {
      rowStart: weekStripSelection.rowIndex,
      rowEnd: weekStripSelection.rowIndex,
      wi0: 0,
      wi1: weekKeys.length - 1,
    }
  }

  if (
    weekMultiSelect &&
    weekMultiSelect.rowIndex === anchorRow &&
    weekMultiSelect.keys.length >= 2
  ) {
    const sorted = sortWeekKeysByTimeline(weekMultiSelect.keys, weekKeys)
    const idxs = sorted.map((k) => weekKeys.indexOf(k)).filter((i) => i >= 0)
    if (idxs.length < 2) return null
    return {
      rowStart: anchorRow,
      rowEnd: anchorRow,
      wi0: Math.min(...idxs),
      wi1: Math.max(...idxs),
    }
  }

  return null
}

export function enumerateWeeklyPasteTargets(
  anchorRow: number,
  anchorWeekKey: string,
  weekRectSelection: ExpertWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  weekMultiSelect: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[],
  rowCount: number
): {
  originRow: number
  originWi: number
  targets: { rowIndex: number; weekKey: string }[]
} | null {
  const region = coerceWeeklySelectionBounds(
    anchorRow,
    anchorWeekKey,
    weekRectSelection,
    weekStripSelection,
    weekMultiSelect,
    weekKeys
  )
  if (region === null) return null

  if (
    weekRectSelection &&
    weekCellInRect(anchorRow, anchorWeekKey, weekRectSelection, weekKeys)
  ) {
    const isSingleCellRect =
      weekRectSelection.rowStart === weekRectSelection.rowEnd &&
      weekRectSelection.weekKeyStart === weekRectSelection.weekKeyEnd
    if (isSingleCellRect) return null

    const { rowStart, rowEnd, wi0, wi1 } = region
    const targets: { rowIndex: number; weekKey: string }[] = []
    for (let r = rowStart; r <= rowEnd; r++) {
      if (r < 0 || r >= rowCount) continue
      for (let wi = wi0; wi <= wi1; wi++) {
        const wk = weekKeys[wi]
        if (wk) targets.push({ rowIndex: r, weekKey: wk })
      }
    }
    return { originRow: rowStart, originWi: wi0, targets }
  }

  if (weekStripSelection && anchorRow === weekStripSelection.rowIndex) {
    const r = region.rowStart
    const targets: { rowIndex: number; weekKey: string }[] = []
    if (r >= 0 && r < rowCount) {
      for (let wi = region.wi0; wi <= region.wi1; wi++) {
        const wk = weekKeys[wi]
        if (wk) targets.push({ rowIndex: r, weekKey: wk })
      }
    }
    return { originRow: r, originWi: region.wi0, targets }
  }

  if (
    weekMultiSelect &&
    weekMultiSelect.rowIndex === anchorRow &&
    weekMultiSelect.keys.length >= 2
  ) {
    const sorted = sortWeekKeysByTimeline(weekMultiSelect.keys, weekKeys)
    const targets: { rowIndex: number; weekKey: string }[] = []
    for (const wk of sorted) {
      if (weekKeys.indexOf(wk) < 0) continue
      targets.push({ rowIndex: anchorRow, weekKey: wk })
    }
    return {
      originRow: region.rowStart,
      originWi: region.wi0,
      targets,
    }
  }

  return null
}

export function clampWeekPasteIndex(i: number, weekLen: number): number {
  if (weekLen <= 0) return 0
  return Math.max(0, Math.min(weekLen - 1, i))
}

export function resolveClosestCampaignWeekIndex(
  parsed: Date,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  nearestReserved: ReadonlySet<number>
): number | null {
  const d = startOfDay(parsed)
  for (let i = 0; i < weekColumns.length; i++) {
    const col = weekColumns[i]!
    const ws = startOfDay(col.weekStart)
    const we = startOfDay(col.weekEnd)
    if (d.getTime() >= ws.getTime() && d.getTime() <= we.getTime()) {
      return i
    }
  }
  let best: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < weekColumns.length; i++) {
    if (nearestReserved.has(i)) continue
    const dist = Math.abs(
      differenceInCalendarDays(d, startOfDay(weekColumns[i]!.weekStart))
    )
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  if (best !== null && bestDist <= WEEK_PASTE_NEAREST_START_TOLERANCE_DAYS) {
    return best
  }
  return null
}

export function mapPastedWeekColumnsToCampaignWeeks(
  headerCells: readonly string[] | null,
  numCols: number,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  originWi: number
): { colToCampaignWi: number[]; usedWeekAlignmentToast: boolean } {
  const wlen = weekColumns.length
  const colToCampaignWi: number[] = []
  let usedWeekAlignmentToast = false
  const nearestReserved = new Set<number>()

  for (let j = 0; j < numCols; j++) {
    const fallback = clampWeekPasteIndex(originWi + j, wlen)

    if (!headerCells || j >= headerCells.length) {
      colToCampaignWi[j] = fallback
      continue
    }

    const cell = (headerCells[j] ?? "").trim()
    if (cell === "") {
      colToCampaignWi[j] = fallback
      continue
    }

    const exactIdx = weekColumns.findIndex((c) => c.weekKey === cell)
    if (exactIdx >= 0) {
      colToCampaignWi[j] = exactIdx
      if (exactIdx !== fallback) usedWeekAlignmentToast = true
      continue
    }

    let parsedDate: Date | null = null
    const dp = parseDatePasteValue(cell)
    if (dp.ok && dp.value !== "") {
      const d0 = parseDateFns(dp.value, "yyyy-MM-dd", new Date())
      if (!Number.isNaN(d0.getTime())) parsedDate = d0
    }
    if (!parsedDate) {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(cell)
      if (m) {
        const d1 = parseDateFns(m[1]!, "yyyy-MM-dd", new Date())
        if (!Number.isNaN(d1.getTime())) parsedDate = d1
      }
    }

    if (parsedDate) {
      let idx: number | null = null
      let usedNearestTolerance = false
      const containedIdx = weekColumns.findIndex((c) => {
        const t = startOfDay(parsedDate!).getTime()
        return (
          t >= startOfDay(c.weekStart).getTime() &&
          t <= startOfDay(c.weekEnd).getTime()
        )
      })
      if (containedIdx >= 0) {
        idx = containedIdx
      } else {
        idx = resolveClosestCampaignWeekIndex(parsedDate, weekColumns, nearestReserved)
        if (idx !== null) {
          usedNearestTolerance = true
          nearestReserved.add(idx)
        }
      }
      if (idx !== null) {
        colToCampaignWi[j] = idx
        if (usedNearestTolerance || idx !== fallback) {
          usedWeekAlignmentToast = true
        }
        continue
      }
    }

    colToCampaignWi[j] = fallback
  }

  return { colToCampaignWi, usedWeekAlignmentToast }
}

export function prepareWeeklyPasteDataWithWeekAlignment(
  matrix: string[][],
  weekColumns: readonly WeeklyGanttWeekColumn[],
  originWi: number
): {
  dataMatrix: string[][]
  colToCampaignWi: number[]
  usedWeekAlignmentToast: boolean
} {
  if (matrix.length === 0) {
    return { dataMatrix: [], colToCampaignWi: [], usedWeekAlignmentToast: false }
  }

  let headerCells: string[] | null = null
  let dataMatrix = matrix
  if (
    matrix.length >= 2 &&
    !rowHasNumericWeekPasteCell(matrix[0]) &&
    rowHasNumericWeekPasteCell(matrix[1])
  ) {
    headerCells = matrix[0] ?? null
    dataMatrix = matrix.slice(1)
  }

  const nC = Math.max(0, ...dataMatrix.map((r) => r.length))
  const { colToCampaignWi, usedWeekAlignmentToast } =
    mapPastedWeekColumnsToCampaignWeeks(headerCells, nC, weekColumns, originWi)

  return { dataMatrix, colToCampaignWi, usedWeekAlignmentToast }
}

export function pasteColumnIndexForCampaignWeekIndex(
  wi: number,
  originWi: number,
  colToCampaignWi: number[]
): number {
  if (colToCampaignWi.length === 0) return wi - originWi
  for (let j = 0; j < colToCampaignWi.length; j++) {
    if (colToCampaignWi[j] === wi) return j
  }
  return wi - originWi
}

export function buildWeeklyPasteTargetsAnchorOnly(
  matrix: string[][],
  anchorRow: number,
  anchorWi: number,
  rowCount: number,
  weekKeys: readonly string[]
): { rowIndex: number; weekKey: string }[] {
  const nR = matrix.length
  if (nR === 0) return []
  const nC = Math.max(0, ...matrix.map((row) => row.length))
  const rowsLeft = Math.max(0, rowCount - anchorRow)
  const colsLeft = Math.max(0, weekKeys.length - anchorWi)
  const destH = Math.min(nR, rowsLeft)
  const destW = Math.min(nC, colsLeft)
  const out: { rowIndex: number; weekKey: string }[] = []
  for (let dr = 0; dr < destH; dr++) {
    for (let dc = 0; dc < destW; dc++) {
      const wk = weekKeys[anchorWi + dc]
      if (wk) out.push({ rowIndex: anchorRow + dr, weekKey: wk })
    }
  }
  return out
}

export function mapClipboardMatrixToWeeklyTargets(
  matrix: string[][],
  originRow: number,
  originWi: number,
  targets: readonly { rowIndex: number; weekKey: string }[],
  weekKeys: readonly string[],
  colToCampaignWi: number[]
): {
  assignments: { rowIndex: number; weekKey: string; raw: string }[]
  layout: WeeklyPasteLayoutMode
} {
  const nR = matrix.length
  if (nR === 0) return { assignments: [], layout: "direct" }
  const nC = Math.max(0, ...matrix.map((row) => row.length))
  if (nC === 0) return { assignments: [], layout: "direct" }
  if (targets.length === 0) return { assignments: [], layout: "direct" }

  let minDr = Infinity
  let maxDr = -Infinity
  let minPc = Infinity
  let maxPc = -Infinity
  for (const t of targets) {
    const dr = t.rowIndex - originRow
    const wi = weekKeys.indexOf(t.weekKey)
    if (wi < 0) continue
    const pasteCol = pasteColumnIndexForCampaignWeekIndex(wi, originWi, colToCampaignWi)
    minDr = Math.min(minDr, dr)
    maxDr = Math.max(maxDr, dr)
    minPc = Math.min(minPc, pasteCol)
    maxPc = Math.max(maxPc, pasteCol)
  }

  const selH = maxDr >= minDr ? maxDr - minDr + 1 : 0
  const selW = maxPc >= minPc ? maxPc - minPc + 1 : 0

  if (!Number.isFinite(minDr) || !Number.isFinite(minPc)) {
    return { assignments: [], layout: "direct" }
  }

  const useClip = nR > selH || nC > selW
  const useTile = !useClip && (nR < selH || nC < selW)
  const layout: WeeklyPasteLayoutMode = useTile ? "tile" : useClip ? "clip" : "direct"

  const out: { rowIndex: number; weekKey: string; raw: string }[] = []
  for (const t of targets) {
    const dr = t.rowIndex - originRow
    const wi = weekKeys.indexOf(t.weekKey)
    if (wi < 0) continue
    const pasteCol = pasteColumnIndexForCampaignWeekIndex(wi, originWi, colToCampaignWi)

    const relDr = dr - minDr
    const relPc = pasteCol - minPc

    let raw: string
    if (useTile) {
      const pr = matrix[((relDr % nR) + nR) % nR] ?? []
      raw = pr[((relPc % nC) + nC) % nC] ?? ""
    } else {
      if (relDr >= nR || relPc >= nC || relDr < 0 || relPc < 0) continue
      raw = matrix[relDr]?.[relPc] ?? ""
    }
    out.push({ rowIndex: t.rowIndex, weekKey: t.weekKey, raw })
  }
  return { assignments: out, layout }
}

export function applyWeeklyPasteMatrixToSelection<R extends ExpertGridRowWithWeekly>(
  args: Readonly<{
    matrix: string[][]
    weekColumns: readonly WeeklyGanttWeekColumn[]
    anchorRow: number
    anchorWeekKey: string
    weekRectSelection: ExpertWeekRectSelection | null
    weekStripSelection: { rowIndex: number } | null
    weekMultiSelect: { rowIndex: number; keys: string[] } | null
    weekKeys: readonly string[]
    rowCount: number
    nextRows: R[]
  }>
): {
  applied: number
  errorReasons: string[]
  layout: WeeklyPasteLayoutMode
  usedWeekAlignmentToast: boolean
} {
  const {
    matrix,
    weekColumns,
    anchorRow,
    anchorWeekKey,
    weekRectSelection,
    weekStripSelection,
    weekMultiSelect,
    weekKeys,
    rowCount,
    nextRows,
  } = args

  const anchorWi = weekKeys.indexOf(anchorWeekKey)
  if (anchorWi < 0) {
    return {
      applied: 0,
      errorReasons: [],
      layout: "direct",
      usedWeekAlignmentToast: false,
    }
  }

  const enumerated = enumerateWeeklyPasteTargets(
    anchorRow,
    anchorWeekKey,
    weekRectSelection,
    weekStripSelection,
    weekMultiSelect,
    weekKeys,
    rowCount
  )

  const originRow = enumerated?.originRow ?? anchorRow
  const originWi = enumerated?.originWi ?? anchorWi

  const { dataMatrix, colToCampaignWi, usedWeekAlignmentToast } =
    prepareWeeklyPasteDataWithWeekAlignment(matrix, weekColumns, originWi)

  const targets = enumerated
    ? enumerated.targets
    : buildWeeklyPasteTargetsAnchorOnly(
        dataMatrix,
        anchorRow,
        anchorWi,
        rowCount,
        weekKeys
      )

  const { assignments, layout } = mapClipboardMatrixToWeeklyTargets(
    dataMatrix,
    originRow,
    originWi,
    targets,
    weekKeys,
    colToCampaignWi
  )

  let applied = 0
  const errorReasons: string[] = []
  const writtenSpanAnchors = new Set<string>()

  for (const { rowIndex, weekKey, raw } of assignments) {
    if (rowIndex < 0 || rowIndex >= rowCount) continue
    const cur = nextRows[rowIndex]
    if (!cur) continue

    const interior = findMergedSpanForWeek(cur, weekKey, weekKeys)
    if (interior && interior.startWeekKey !== weekKey) {
      continue
    }

    const res = parseWeeklyPasteValue(raw)
    if (!res.ok) {
      errorReasons.push(res.reason)
      continue
    }

    const rowAt = nextRows[rowIndex]
    if (!rowAt) continue

    const spanAt = findMergedSpanForWeek(rowAt, weekKey, weekKeys)

    if (spanAt && spanAt.startWeekKey === weekKey) {
      const opKey = `${rowIndex}:${spanAt.id}`
      if (writtenSpanAnchors.has(opKey)) continue
      const nextQty = res.value === "" ? 0 : (res.value as number)
      nextRows[rowIndex] = {
        ...rowAt,
        mergedWeekSpans: (rowAt.mergedWeekSpans ?? []).map((s) =>
          s.id === spanAt.id ? { ...s, totalQty: nextQty } : s
        ),
      } as R
      applied += 1
      writtenSpanAnchors.add(opKey)
      continue
    }

    nextRows[rowIndex] = {
      ...rowAt,
      weeklyValues: { ...rowAt.weeklyValues, [weekKey]: res.value },
    } as R
    applied += 1
  }

  return { applied, errorReasons, layout, usedWeekAlignmentToast }
}

export function weekRangeOutlineFlags(
  rowIndex: number,
  weekIndex: number,
  rect: ExpertWeekRectSelection | null,
  stripRowIndex: number | null,
  weekKeys: readonly string[]
): SelectionOutlineFlags {
  const empty = {
    inRange: false,
    top: false,
    bottom: false,
    left: false,
    right: false,
  }
  if (stripRowIndex !== null && rowIndex === stripRowIndex) {
    const last = weekKeys.length - 1
    return {
      inRange: true,
      top: true,
      bottom: true,
      left: weekIndex === 0,
      right: weekIndex === last,
    }
  }
  if (!rect) return empty
  const a = weekKeys.indexOf(rect.weekKeyStart)
  const b = weekKeys.indexOf(rect.weekKeyEnd)
  if (a < 0 || b < 0) return empty
  const w0 = Math.min(a, b)
  const w1 = Math.max(a, b)
  if (weekIndex < w0 || weekIndex > w1) return empty
  if (rowIndex < rect.rowStart || rowIndex > rect.rowEnd) return empty
  return {
    inRange: true,
    top: rowIndex === rect.rowStart,
    bottom: rowIndex === rect.rowEnd,
    left: weekIndex === w0,
    right: weekIndex === w1,
  }
}

export function weekOutlineEdgeClasses(flags: SelectionOutlineFlags): string {
  if (!flags.inRange) return ""
  return cn(
    "relative z-[3]",
    flags.top && "border-t-[3px] border-t-primary",
    flags.bottom && "border-b-[3px] border-b-primary",
    flags.left && "border-l-[3px] border-l-primary",
    flags.right && "border-r-[3px] border-r-primary"
  )
}

export function mergeReadyOutlineFlags(
  rowIndex: number,
  weekIndex: number,
  mergeTarget: { rowIndex: number; keys: string[] } | null,
  mergeWeeksReady: boolean,
  weekKeys: readonly string[]
): SelectionOutlineFlags {
  const empty = {
    inRange: false,
    top: false,
    bottom: false,
    left: false,
    right: false,
  }
  if (!mergeWeeksReady || !mergeTarget || mergeTarget.rowIndex !== rowIndex) return empty
  const ordered = sortWeekKeysByTimeline([...mergeTarget.keys], weekKeys)
  if (ordered.length < 2 || !weekKeysAreContiguous(ordered, weekKeys)) return empty
  const i0 = weekKeys.indexOf(ordered[0]!)
  const i1 = weekKeys.indexOf(ordered[ordered.length - 1]!)
  if (i0 < 0 || i1 < 0) return empty
  if (weekIndex < i0 || weekIndex > i1) return empty
  return {
    inRange: true,
    top: true,
    bottom: true,
    left: weekIndex === i0,
    right: weekIndex === i1,
  }
}

export function mergeReadyOutlineEdgeClasses(flags: SelectionOutlineFlags): string {
  if (!flags.inRange) return ""
  return cn(
    "relative z-[7]",
    flags.top && "border-t-[4px] border-t-amber-600 dark:border-t-amber-400",
    flags.bottom && "border-b-[4px] border-b-amber-600 dark:border-b-amber-400",
    flags.left && "border-l-[4px] border-l-amber-600 dark:border-l-amber-400",
    flags.right && "border-r-[4px] border-r-amber-600 dark:border-r-amber-400"
  )
}

export function weekCellInMergePulseHighlight(
  rowIndex: number,
  weekKey: string,
  pulse: { rowIndex: number; startWeekKey: string; endWeekKey: string } | null,
  weekKeys: readonly string[]
): boolean {
  if (!pulse || pulse.rowIndex !== rowIndex) return false
  const i = weekKeys.indexOf(weekKey)
  const i0 = Math.min(
    weekKeys.indexOf(pulse.startWeekKey),
    weekKeys.indexOf(pulse.endWeekKey)
  )
  const i1 = Math.max(
    weekKeys.indexOf(pulse.startWeekKey),
    weekKeys.indexOf(pulse.endWeekKey)
  )
  if (i < 0 || i0 < 0 || i1 < 0) return false
  return i >= i0 && i <= i1
}

export function mergeKeysFromRect(
  rect: ExpertWeekRectSelection,
  weekKeys: readonly string[]
): string[] | null {
  if (rect.rowStart !== rect.rowEnd) return null
  const i0 = weekKeys.indexOf(rect.weekKeyStart)
  const i1 = weekKeys.indexOf(rect.weekKeyEnd)
  const lo = Math.min(i0, i1)
  const hi = Math.max(i0, i1)
  if (lo < 0 || hi < 0) return null
  const keys = weekKeys.slice(lo, hi + 1)
  if (!weekKeysAreContiguous(keys, weekKeys)) return null
  return keys
}

export function normalizeWeekMergeSelection(
  rect: ExpertWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): WeekMergeSelectionNormalized | null {
  if (rect && rect.rowStart === rect.rowEnd) {
    const keys = mergeKeysFromRect(rect, weekKeys)
    if (keys && keys.length >= 2) {
      return {
        rowIndex: rect.rowStart,
        orderedWeekKeys: keys,
        anchorWeekKey: keys[0]!,
      }
    }
  }
  if (multi && multi.keys.length >= 2) {
    const sorted = sortWeekKeysByTimeline(multi.keys, weekKeys)
    if (weekKeysAreContiguous(sorted, weekKeys)) {
      return {
        rowIndex: multi.rowIndex,
        orderedWeekKeys: sorted,
        anchorWeekKey: sorted[0]!,
      }
    }
  }
  return null
}

/** @deprecated Use {@link normalizeWeekMergeSelection} */
export const normalizeOohWeekMergeSelection = normalizeWeekMergeSelection

export function weekPlainClickPreservesWeekAreaSelection(
  rowIndex: number,
  weekKey: string,
  rect: ExpertWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): boolean {
  const mergeNorm = normalizeWeekMergeSelection(rect, multi, weekKeys)
  if (
    mergeNorm &&
    mergeNorm.rowIndex === rowIndex &&
    mergeNorm.orderedWeekKeys.includes(weekKey)
  ) {
    return true
  }
  if (rect && weekCellInRect(rowIndex, weekKey, rect, weekKeys)) {
    const isSingleCell =
      rect.rowStart === rect.rowEnd && rect.weekKeyStart === rect.weekKeyEnd
    if (!isSingleCell) return true
  }
  return false
}

export function deriveMergeEligibility(
  rect: ExpertWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): WeekMergeSelectionNormalized | null {
  return normalizeWeekMergeSelection(rect, multi, weekKeys)
}

/** @deprecated Use {@link deriveMergeEligibility} */
export const deriveOohMergeEligibility = deriveMergeEligibility

export function weekCellExportText<R extends ExpertGridRowWithWeekly>(
  row: R,
  weekKey: string,
  weekKeys: readonly string[]
): string {
  const sp = findMergedSpanForWeek(row, weekKey, weekKeys)
  if (sp) {
    return sp.startWeekKey === weekKey ? String(sp.totalQty) : ""
  }
  const v = row.weeklyValues[weekKey]
  return v === "" || v === undefined ? "" : String(v)
}

export function mergedWeekSpansAfterCutRect<S extends ExpertGridMergeSpan>(
  spans: readonly S[] | undefined,
  wi0: number,
  wi1: number,
  weekKeys: readonly string[]
): S[] {
  const list = spans ?? []
  return list.map((sp) => {
    const si0 = Math.min(
      weekKeys.indexOf(sp.startWeekKey),
      weekKeys.indexOf(sp.endWeekKey)
    )
    const si1 = Math.max(
      weekKeys.indexOf(sp.startWeekKey),
      weekKeys.indexOf(sp.endWeekKey)
    )
    if (si0 < 0 || si1 < 0) return sp
    const overlaps = !(si1 < wi0 || si0 > wi1)
    if (!overlaps) return sp
    return { ...sp, totalQty: 0 }
  })
}

export function resolveWeeklyExportSelection<R extends ExpertGridRowWithWeekly>(
  weekRectSelection: ExpertWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  mergeTarget: { rowIndex: number; keys: string[] } | null,
  focusedCell: { rowIndex: number; columnKey: string } | null,
  weekKeys: readonly string[],
  rows: readonly R[] | null
): WeeklyExportSelection | null {
  if (weekRectSelection) {
    return { kind: "rect", rect: weekRectSelection }
  }
  if (weekStripSelection) {
    return { kind: "strip", rowIndex: weekStripSelection.rowIndex }
  }
  if (mergeTarget && mergeTarget.keys.length >= 2) {
    return {
      kind: "mergeContiguous",
      rowIndex: mergeTarget.rowIndex,
      weekKeys: mergeTarget.keys,
    }
  }
  if (focusedCell && weekKeys.includes(focusedCell.columnKey)) {
    if (rows) {
      const row = rows[focusedCell.rowIndex]
      if (row) {
        const span = findMergedSpanForWeek(row, focusedCell.columnKey, weekKeys)
        if (span && span.startWeekKey !== focusedCell.columnKey) {
          return null
        }
      }
    }
    return {
      kind: "focusedWeekCell",
      rowIndex: focusedCell.rowIndex,
      weekKey: focusedCell.columnKey,
    }
  }
  return null
}

export function buildWeeklyExportTsv<R extends ExpertGridRowWithWeekly>(
  selection: WeeklyExportSelection,
  rows: readonly R[],
  weekKeys: readonly string[]
): string | null {
  switch (selection.kind) {
    case "rect": {
      const rect = selection.rect
      const wi0 = Math.min(
        weekKeys.indexOf(rect.weekKeyStart),
        weekKeys.indexOf(rect.weekKeyEnd)
      )
      const wi1 = Math.max(
        weekKeys.indexOf(rect.weekKeyStart),
        weekKeys.indexOf(rect.weekKeyEnd)
      )
      if (wi0 < 0 || wi1 < 0) return null
      const lines: string[] = []
      for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
        const row = rows[r]
        if (!row) continue
        const cells: string[] = []
        for (let wi = wi0; wi <= wi1; wi++) {
          const wk = weekKeys[wi]
          if (wk) cells.push(weekCellExportText(row, wk, weekKeys))
        }
        lines.push(cells.join("\t"))
      }
      if (lines.length === 0) return null
      return lines.join("\n")
    }
    case "strip": {
      const row = rows[selection.rowIndex]
      if (!row) return null
      return weekKeys.map((k) => weekCellExportText(row, k, weekKeys)).join("\t")
    }
    case "mergeContiguous": {
      const row = rows[selection.rowIndex]
      if (!row) return null
      const ordered = sortWeekKeysByTimeline([...selection.weekKeys], weekKeys)
      if (ordered.length === 0) return null
      return ordered.map((k) => weekCellExportText(row, k, weekKeys)).join("\t")
    }
    case "focusedWeekCell": {
      const row = rows[selection.rowIndex]
      if (!row) return null
      return weekCellExportText(row, selection.weekKey, weekKeys)
    }
    default:
      return null
  }
}

export function applyWeeklyCutToRows<R extends ExpertGridRowWithWeekly>(
  selection: WeeklyExportSelection,
  rows: readonly R[],
  weekKeys: readonly string[]
): R[] | null {
  switch (selection.kind) {
    case "rect": {
      const rect = selection.rect
      const wi0 = Math.min(
        weekKeys.indexOf(rect.weekKeyStart),
        weekKeys.indexOf(rect.weekKeyEnd)
      )
      const wi1 = Math.max(
        weekKeys.indexOf(rect.weekKeyStart),
        weekKeys.indexOf(rect.weekKeyEnd)
      )
      if (wi0 < 0 || wi1 < 0) return null
      const next: R[] = rows.map((r) => ({
        ...r,
        mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
      })) as R[]
      for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
        const row = next[r]
        if (!row) continue
        const weeklyValues = { ...row.weeklyValues } as ExpertWeeklyValues
        for (let wi = wi0; wi <= wi1; wi++) {
          const wk = weekKeys[wi]
          if (wk) weeklyValues[wk] = ""
        }
        next[r] = {
          ...row,
          weeklyValues,
          mergedWeekSpans: mergedWeekSpansAfterCutRect(
            row.mergedWeekSpans,
            wi0,
            wi1,
            weekKeys
          ),
        } as R
      }
      return next
    }
    case "strip": {
      const rowIndex = selection.rowIndex
      const source = rows[rowIndex]
      if (!source) return null
      const cleared = { ...source.weeklyValues } as ExpertWeeklyValues
      for (const k of weekKeys) cleared[k] = ""
      return rows.map((r, i) =>
        i === rowIndex
          ? ({
              ...r,
              weeklyValues: cleared,
              mergedWeekSpans: (r.mergedWeekSpans ?? []).map((sp) => ({
                ...sp,
                totalQty: 0,
              })),
            } as R)
          : r
      ) as R[]
    }
    case "mergeContiguous": {
      const ordered = sortWeekKeysByTimeline([...selection.weekKeys], weekKeys)
      if (ordered.length === 0) return null
      const wi0 = weekKeys.indexOf(ordered[0]!)
      const wi1 = weekKeys.indexOf(ordered[ordered.length - 1]!)
      if (wi0 < 0 || wi1 < 0) return null
      const r = selection.rowIndex
      const next: R[] = rows.map((row) => ({
        ...row,
        mergedWeekSpans: [...(row.mergedWeekSpans ?? [])],
      })) as R[]
      const row = next[r]
      if (!row) return null
      const weeklyValues = { ...row.weeklyValues } as ExpertWeeklyValues
      for (let wi = wi0; wi <= wi1; wi++) {
        const wk = weekKeys[wi]
        if (wk) weeklyValues[wk] = ""
      }
      next[r] = {
        ...row,
        weeklyValues,
        mergedWeekSpans: mergedWeekSpansAfterCutRect(
          row.mergedWeekSpans,
          wi0,
          wi1,
          weekKeys
        ),
      } as R
      return next
    }
    case "focusedWeekCell": {
      const r = selection.rowIndex
      const wk = selection.weekKey
      return rows.map((row, i) => {
        if (i !== r) return row
        const span = findMergedSpanForWeek(row, wk, weekKeys)
        if (span && span.startWeekKey !== wk) {
          return row
        }
        if (span && span.startWeekKey === wk) {
          return {
            ...row,
            mergedWeekSpans: (row.mergedWeekSpans ?? []).map((s) =>
              s.id === span.id ? { ...s, totalQty: 0 } : s
            ),
          } as R
        }
        return {
          ...row,
          weeklyValues: { ...row.weeklyValues, [wk]: "" as const },
        } as R
      }) as R[]
    }
    default:
      return null
  }
}

/** Layout style object for week columns (matches {@link WEEK_COL_WIDTH_PX}). */
export const expertWeekColLayoutStyle = {
  width: WEEK_COL_WIDTH_PX,
  minWidth: WEEK_COL_WIDTH_PX,
  maxWidth: WEEK_COL_WIDTH_PX,
  boxSizing: "border-box" as const,
}
