"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import {
  differenceInCalendarDays,
  format,
  parse as parseDateFns,
  startOfDay,
} from "date-fns"
import { Copy, GitMerge, Grid3x3, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  fuzzyMatchNetwork,
  fuzzyMatchStation,
} from "@/lib/mediaplan/expertOohFuzzyMatch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  ExpertWeeklyValues,
  TelevisionExpertMergedWeekSpan,
  TelevisionExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  anchorPasteColumnFromKey,
  clipboardMatrixFromDataTransfer,
  parseDatePasteValue,
  parseRatePasteValue,
  parseWeeklyPasteValue,
  readClipboardMatrixAsync,
  resolvePasteColumn,
  rowHasNumericWeekPasteCell,
  trimEmptyEdgeColumns,
} from "@/lib/mediaplan/expertGridPaste"
import {
  expertGridCellId,
  focusExpertGridCell,
  handleExpertGridInputKeyDown,
} from "@/lib/mediaplan/expertGridKeyboardNav"
import {
  deriveTelevisionExpertRowScheduleYmdFromRow,
  weekKeysInSpanInclusive,
} from "@/lib/mediaplan/expertOohRadioMappings"
import {
  buildWeeklyGanttColumnsFromCampaign,
  type WeeklyGanttWeekColumn,
} from "@/lib/utils/weeklyGanttColumns"
import { formatMoney } from "@/lib/utils/money"
import { cn } from "@/lib/utils"
import {
  getMediaTypeThemeHex,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"

/** Non-editable columns between last descriptor (unit rate) and first week (gross, actions, Σ qty). */
const WEEK_GRID_COL_OFFSET = 3

/** Fixed width (px) for each Gantt week column; header and week cells match for horizontal scroll. */
const TV_EXPERT_WEEK_COL_WIDTH_PX = 112

/** Week column width on `<th>` and week `<td>`; inputs use `w-full` inside the cell. */
const tvExpertWeekColLayoutStyle = {
  width: TV_EXPERT_WEEK_COL_WIDTH_PX,
  minWidth: TV_EXPERT_WEEK_COL_WIDTH_PX,
  maxWidth: TV_EXPERT_WEEK_COL_WIDTH_PX,
  boxSizing: "border-box" as const,
}

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("television")

const tvExpertHeaderCellBgStyle = {
  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.08),
}

const tvExpertTotalsRowBgStyle = {
  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.06),
}

/** Right edge of sticky block before the horizontally scrolling week area. */
const TV_EXPERT_WEEK_SCROLLER_EDGE =
  "border-r-2 border-border/80 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)] dark:shadow-[2px_0_8px_-4px_rgba(0,0,0,0.22)]"

const DEBUG_TV_MERGE = false

function parseNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function sumWeeklyQuantities(
  weeklyValues: ExpertWeeklyValues,
  weekKeys: string[]
): number {
  return weekKeys.reduce((s, k) => s + parseNum(weeklyValues[k]), 0)
}

function sumMergedQuantities(row: TelevisionExpertScheduleRow): number {
  return (row.mergedWeekSpans ?? []).reduce(
    (s, sp) => s + (Number.isFinite(sp.totalQty) ? sp.totalQty : 0),
    0
  )
}

function findMergedSpanForWeek(
  row: TelevisionExpertScheduleRow,
  weekKey: string,
  order: readonly string[]
): TelevisionExpertMergedWeekSpan | null {
  for (const span of row.mergedWeekSpans ?? []) {
    const keys = weekKeysInSpanInclusive(
      order,
      span.startWeekKey,
      span.endWeekKey
    )
    if (keys.includes(weekKey)) return span
  }
  return null
}

function weekCellIsPopulated(
  row: TelevisionExpertScheduleRow,
  weekKey: string,
  order: readonly string[]
): boolean {
  const span = findMergedSpanForWeek(row, weekKey, order)
  if (span) {
    return Number.isFinite(span.totalQty) && span.totalQty !== 0
  }
  const v = row.weeklyValues[weekKey]
  if (v === "" || v === undefined || v === null) return false
  return Number.isFinite(parseNum(v)) && parseNum(v) !== 0
}

function normalizeWeekValueForExpertGridBoundary(
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

/**
 * Parse clipboard text that may contain tab-separated values (Excel/Sheets)
 * into a row/column matrix.
 */
function parseClipboardToMatrix(text: string): string[][] {
  if (!text || text.trim() === "") return []
  return text
    .split(/\r?\n/)
    .filter((row) => row.length > 0)
    .map((row) => row.split("\t"))
}

type TelevisionMultiCellSelection = {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

type TelevisionCopiedCells = {
  data: (string | number)[][]
  sourceRows: number
  sourceCols: number
  selection: TelevisionMultiCellSelection
}

function weeklyCellDisplayValue(
  cellValue: number | string | undefined,
  mergedSpan: TelevisionExpertMergedWeekSpan | null
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

const TV_WEEK_CELL_VISUAL_CLASSES = {
  /** Single visual block for colSpan anchor: no flex seam; inset ring stays inside on focus. */
  mergedSurface:
    "relative h-full min-h-8 w-full min-w-0 overflow-hidden rounded-md border border-violet-600/80 bg-violet-500/[0.28] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(16,24,40,0.18)] transition-[color,background-color,box-shadow] hover:bg-violet-500/[0.29] focus-within:bg-violet-500/[0.29] focus-within:ring-1 focus-within:ring-inset focus-within:ring-violet-500/55 dark:border-violet-400/80 dark:bg-violet-500/[0.26] dark:hover:bg-violet-500/[0.27] dark:focus-within:bg-violet-500/[0.27] dark:focus-within:ring-violet-400/55",
  /** Fills merged td; pr leaves room for unmerge control. Text stays centred across full width. */
  mergedInput:
    "box-border min-h-8 h-full w-full max-w-none border-0 bg-transparent py-0 pl-2 pr-10 text-center text-[11px] tabular-nums font-semibold leading-8 text-violet-950 shadow-none ring-0 outline-none dark:text-violet-100 focus-visible:ring-0 focus-visible:ring-offset-0",
  populatedSingleTd:
    "bg-blue-500/10 dark:bg-blue-400/16",
} as const

function sortWeekKeysByTimeline(keys: string[], order: readonly string[]): string[] {
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

function weekKeysAreContiguous(sortedKeys: string[], order: readonly string[]): boolean {
  if (sortedKeys.length < 2) return false
  const idx = sortedKeys.map((k) => order.indexOf(k))
  if (idx.some((i) => i < 0)) return false
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1]! + 1) return false
  }
  return true
}

/**
 * True when the proposed merge selection shares at least one campaign week with an
 * existing merged span on the row. Adjacent ranges (e.g. merged 2–4 vs new 5–7) are
 * allowed; touching at a calendar boundary without sharing a week key is not overlap.
 */
function selectionOverlapsMergedSpan(
  rowMergeMap: TelevisionRowMergeMap | undefined,
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

type TelevisionWeekRectSelection = {
  rowStart: number
  rowEnd: number
  weekKeyStart: string
  weekKeyEnd: string
}

function normalizeTelevisionWeekRect(
  row0: number,
  wk0: string,
  row1: number,
  wk1: string,
  weekKeys: readonly string[]
): TelevisionWeekRectSelection {
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

function tvWeekCellInRect(
  rowIndex: number,
  weekKey: string,
  rect: TelevisionWeekRectSelection | null,
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

function rectToMultiCellSelection(
  rect: TelevisionWeekRectSelection | null,
  weekKeys: readonly string[]
): TelevisionMultiCellSelection | null {
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

function selectionBoundsFromWeeklyExportSelection(
  selection: WeeklyExportSelection,
  weekKeys: readonly string[]
): TelevisionMultiCellSelection | null {
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

/** Inclusive week-area rectangle for paste (rect, strip, or multi-select bbox). */
type WeeklySelectionBounds = {
  rowStart: number
  rowEnd: number
  wi0: number
  wi1: number
}

/**
 * Derives the active weekly paste region from selection + anchor.
 * Returns null when only a single anchor cell should receive a one-shot clipped paste.
 */
function coerceWeeklySelectionBounds(
  anchorRow: number,
  anchorWeekKey: string,
  weekRectSelection: TelevisionWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  weekMultiSelect: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): WeeklySelectionBounds | null {
  const awi = weekKeys.indexOf(anchorWeekKey)
  if (awi < 0) return null

  if (
    weekRectSelection &&
    tvWeekCellInRect(anchorRow, anchorWeekKey, weekRectSelection, weekKeys)
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
    const idxs = sorted
      .map((k) => weekKeys.indexOf(k))
      .filter((i) => i >= 0)
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

/** Target cells in row-major order; null ⇒ anchor-only clipped paste. */
function enumerateWeeklyPasteTargets(
  anchorRow: number,
  anchorWeekKey: string,
  weekRectSelection: TelevisionWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  weekMultiSelect: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[],
  rowCount: number
): { originRow: number; originWi: number; targets: { rowIndex: number; weekKey: string }[] } | null {
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
    tvWeekCellInRect(anchorRow, anchorWeekKey, weekRectSelection, weekKeys)
  ) {
    // Single-cell rect = no explicit multi-cell selection.
    // Return null so paste uses anchor-only expansion (Excel behavior:
    // clicked cell is top-left, clipboard matrix fills rightward/downward).
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

type WeeklyPasteLayoutMode = "tile" | "clip" | "direct"

/** Nearest campaign week start must be within this many calendar days (inclusive). */
const WEEK_PASTE_NEAREST_START_TOLERANCE_DAYS = 4

function clampWeekPasteIndex(i: number, weekLen: number): number {
  if (weekLen <= 0) return 0
  return Math.max(0, Math.min(weekLen - 1, i))
}

/**
 * Maps a parsed calendar date to a campaign week: containment in [weekStart, weekEnd] first,
 * else nearest week start by calendar-day distance if within {@link WEEK_PASTE_NEAREST_START_TOLERANCE_DAYS}.
 * `nearestReserved` prevents two ambiguous nearest matches from claiming the same week.
 */
function resolveClosestCampaignWeekIndex(
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
  if (
    best !== null &&
    bestDist <= WEEK_PASTE_NEAREST_START_TOLERANCE_DAYS
  ) {
    return best
  }
  return null
}

/**
 * For each pasted column (left to right), maps to a campaign week index using optional header labels.
 * Falls back to `originWi + columnIndex` when a header cell is empty or unparseable.
 */
function mapPastedWeekColumnsToCampaignWeeks(
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
        idx = resolveClosestCampaignWeekIndex(
          parsedDate,
          weekColumns,
          nearestReserved
        )
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

function prepareWeeklyPasteDataWithWeekAlignment(
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

/** Left-to-right: first pasted column mapped to this campaign week supplies the value. */
function pasteColumnIndexForCampaignWeekIndex(
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

/**
 * Destination cells for a single-anchor paste: min(matrix, grid) footprint from anchor.
 */
function buildWeeklyPasteTargetsAnchorOnly(
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

/**
 * Maps clipboard matrix onto week targets using Excel-style rules:
 * - Matrix larger than selection (in rows or cols) → clip (top-left; skip cells past matrix edge).
 * - Matrix smaller in either dimension than selection → tile with modulo.
 * - Otherwise → direct 1:1 indices.
 */
function mapClipboardMatrixToWeeklyTargets(
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
    const pasteCol = pasteColumnIndexForCampaignWeekIndex(
      wi,
      originWi,
      colToCampaignWi
    )
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
  const layout: WeeklyPasteLayoutMode = useTile
    ? "tile"
    : useClip
      ? "clip"
      : "direct"

  const out: { rowIndex: number; weekKey: string; raw: string }[] = []
  for (const t of targets) {
    const dr = t.rowIndex - originRow
    const wi = weekKeys.indexOf(t.weekKey)
    if (wi < 0) continue
    const pasteCol = pasteColumnIndexForCampaignWeekIndex(
      wi,
      originWi,
      colToCampaignWi
    )

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

function applyWeeklyPasteMatrixToSelection(args: {
  matrix: string[][]
  weekColumns: readonly WeeklyGanttWeekColumn[]
  anchorRow: number
  anchorWeekKey: string
  weekRectSelection: TelevisionWeekRectSelection | null
  weekStripSelection: { rowIndex: number } | null
  weekMultiSelect: { rowIndex: number; keys: string[] } | null
  weekKeys: readonly string[]
  rowCount: number
  nextRows: TelevisionExpertScheduleRow[]
}): {
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
      // Preserve merged spans during paste, including empty clipboard cells.
      const nextQty = res.value === "" ? 0 : (res.value as number)
      nextRows[rowIndex] = {
        ...rowAt,
        mergedWeekSpans: (rowAt.mergedWeekSpans ?? []).map((s) =>
          s.id === spanAt.id ? { ...s, totalQty: nextQty } : s
        ),
      }
      applied += 1
      writtenSpanAnchors.add(opKey)
      continue
    }

    nextRows[rowIndex] = {
      ...rowAt,
      weeklyValues: { ...rowAt.weeklyValues, [weekKey]: res.value },
    }
    applied += 1
  }

  return { applied, errorReasons, layout, usedWeekAlignmentToast }
}

/** Perimeter flags for a spreadsheet-style selection outline (rect or full week strip on one row). */
function tvWeekRangeOutlineFlags(
  rowIndex: number,
  weekIndex: number,
  rect: TelevisionWeekRectSelection | null,
  stripRowIndex: number | null,
  weekKeys: readonly string[]
): { inRange: boolean; top: boolean; bottom: boolean; left: boolean; right: boolean } {
  const empty = { inRange: false, top: false, bottom: false, left: false, right: false }
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

function tvWeekOutlineEdgeClasses(flags: {
  inRange: boolean
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}): string {
  if (!flags.inRange) return ""
  return cn(
    "relative z-[3]",
    flags.top && "border-t-[3px] border-t-primary",
    flags.bottom && "border-b-[3px] border-b-primary",
    flags.left && "border-l-[3px] border-l-primary",
    flags.right && "border-r-[3px] border-r-primary"
  )
}

function oohMergeReadyOutlineFlags(
  rowIndex: number,
  weekIndex: number,
  mergeTarget: { rowIndex: number; keys: string[] } | null,
  mergeWeeksReady: boolean,
  weekKeys: readonly string[]
): { inRange: boolean; top: boolean; bottom: boolean; left: boolean; right: boolean } {
  const empty = { inRange: false, top: false, bottom: false, left: false, right: false }
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

function oohMergeReadyOutlineEdgeClasses(flags: {
  inRange: boolean
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}): string {
  if (!flags.inRange) return ""
  return cn(
    "relative z-[7]",
    flags.top && "border-t-[4px] border-t-amber-600 dark:border-t-amber-400",
    flags.bottom && "border-b-[4px] border-b-amber-600 dark:border-b-amber-400",
    flags.left && "border-l-[4px] border-l-amber-600 dark:border-l-amber-400",
    flags.right && "border-r-[4px] border-r-amber-600 dark:border-r-amber-400"
  )
}

/** Brief highlight of a merged span after jumping focus from an interior cell. */
function tvWeekCellInMergePulseHighlight(
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

function oohMergeKeysFromRect(
  rect: TelevisionWeekRectSelection,
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

/** Same-row contiguous week selection suitable for merge (≥2 weeks). */
type TelevisionWeekMergeSelectionNormalized = {
  rowIndex: number
  orderedWeekKeys: string[]
  /** Timeline-first week in the merge (editable anchor). */
  anchorWeekKey: string
}

/**
 * Resolves rect + ctrl/shift multi state into one row and ordered contiguous week keys.
 * Rect path first so drag-range selection (multi cleared during drag) still merges.
 */
function normalizeTelevisionWeekMergeSelection(
  rect: TelevisionWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): TelevisionWeekMergeSelectionNormalized | null {
  if (rect && rect.rowStart === rect.rowEnd) {
    const keys = oohMergeKeysFromRect(rect, weekKeys)
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

/**
 * Plain (no modifier) week-cell click should keep the current area selection when the
 * click lands inside a merge-eligible strip or any multi-cell rectangle — Excel-style
 * until the user clicks outside, presses Escape, or starts an incompatible selection.
 */
function weekPlainClickPreservesWeekAreaSelection(
  rowIndex: number,
  weekKey: string,
  rect: TelevisionWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): boolean {
  const mergeNorm = normalizeTelevisionWeekMergeSelection(rect, multi, weekKeys)
  if (
    mergeNorm &&
    mergeNorm.rowIndex === rowIndex &&
    mergeNorm.orderedWeekKeys.includes(weekKey)
  ) {
    return true
  }
  if (rect && tvWeekCellInRect(rowIndex, weekKey, rect, weekKeys)) {
    const isSingleCell =
      rect.rowStart === rect.rowEnd &&
      rect.weekKeyStart === rect.weekKeyEnd
    if (!isSingleCell) return true
  }
  return false
}

/** Merge resolution for inline icon / actions: one row only, ≥2 contiguous weeks (timeline order). */
function deriveTelevisionMergeEligibility(
  rect: TelevisionWeekRectSelection | null,
  multi: { rowIndex: number; keys: string[] } | null,
  weekKeys: readonly string[]
): TelevisionWeekMergeSelectionNormalized | null {
  return normalizeTelevisionWeekMergeSelection(rect, multi, weekKeys)
}

function weekCellExportText(
  row: TelevisionExpertScheduleRow,
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

function mergedWeekSpansAfterCutRect(
  spans: TelevisionExpertMergedWeekSpan[] | undefined,
  wi0: number,
  wi1: number,
  weekKeys: readonly string[]
): TelevisionExpertMergedWeekSpan[] {
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
    // Cutting over a merged anchor clears quantity only; merge remains until X is clicked.
    return { ...sp, totalQty: 0 }
  })
}

/** Resolved source for weekly TSV export and cut (priority: rect → strip → merge-ready → focused week). */
type WeeklyExportSelection =
  | { kind: "rect"; rect: TelevisionWeekRectSelection }
  | { kind: "strip"; rowIndex: number }
  | { kind: "mergeContiguous"; rowIndex: number; weekKeys: readonly string[] }
  | { kind: "focusedWeekCell"; rowIndex: number; weekKey: string }

function resolveWeeklyExportSelection(
  weekRectSelection: TelevisionWeekRectSelection | null,
  weekStripSelection: { rowIndex: number } | null,
  mergeTarget: { rowIndex: number; keys: string[] } | null,
  focusedCell: { rowIndex: number; columnKey: string } | null,
  weekKeys: readonly string[],
  rows: readonly TelevisionExpertScheduleRow[] | null
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

function buildWeeklyExportTsv(
  selection: WeeklyExportSelection,
  rows: readonly TelevisionExpertScheduleRow[],
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
      const ordered = sortWeekKeysByTimeline(
        [...selection.weekKeys],
        weekKeys
      )
      if (ordered.length === 0) return null
      return ordered
        .map((k) => weekCellExportText(row, k, weekKeys))
        .join("\t")
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

/**
 * Clears writable week data for the export selection. Merged spans are retained;
 * anchors touched by the cut region are set to zero quantity.
 */
function applyWeeklyCutToRows(
  selection: WeeklyExportSelection,
  rows: readonly TelevisionExpertScheduleRow[],
  weekKeys: readonly string[]
): TelevisionExpertScheduleRow[] | null {
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
      const next: TelevisionExpertScheduleRow[] = rows.map((r) => ({
        ...r,
        mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
      }))
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
        }
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
          ? {
              ...r,
              weeklyValues: cleared,
              mergedWeekSpans: (r.mergedWeekSpans ?? []).map((sp) => ({
                ...sp,
                totalQty: 0,
              })),
            }
          : r
      )
    }
    case "mergeContiguous": {
      const ordered = sortWeekKeysByTimeline(
        [...selection.weekKeys],
        weekKeys
      )
      if (ordered.length === 0) return null
      const wi0 = weekKeys.indexOf(ordered[0]!)
      const wi1 = weekKeys.indexOf(ordered[ordered.length - 1]!)
      if (wi0 < 0 || wi1 < 0) return null
      const r = selection.rowIndex
      const next: TelevisionExpertScheduleRow[] = rows.map((row) => ({
        ...row,
        mergedWeekSpans: [...(row.mergedWeekSpans ?? [])],
      }))
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
      }
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
          }
        }
        return {
          ...row,
          weeklyValues: { ...row.weeklyValues, [wk]: "" as const },
        }
      })
    }
    default:
      return null
  }
}

/** Match labels/values on {@link TelevisionContainer} buy-type combobox. */
const TV_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "cpm", label: "CPM" },
  { value: "cpt", label: "CPT" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "package", label: "Package" },
  { value: "spots", label: "Spots" },
  { value: "CPP", label: "CPP" },
  { value: "cpp", label: "CPP (lower)" },
]

function normalizeTelevisionBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = TV_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = TV_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}

function normalizeTelevisionNetworkPaste(raw: string, networkNames: string[]): string {
  const v = raw.trim()
  if (!v) return ""
  const exact = networkNames.find((n) => n.toLowerCase() === v.toLowerCase())
  if (exact) return exact
  const fz = fuzzyMatchNetwork(v, networkNames)
  return fz?.matched ?? v
}

function normalizeTelevisionStationPaste(raw: string, stationNames: string[]): string {
  const v = raw.trim()
  if (!v) return ""
  const exact = stationNames.find((n) => n.toLowerCase() === v.toLowerCase())
  if (exact) return exact
  const fz = fuzzyMatchStation(v, stationNames)
  return fz?.matched ?? v
}

function rowGrossCost(row: TelevisionExpertScheduleRow, weekKeys: string[]): number {
  const rate = parseNum(row.unitRate)
  return (
    rate *
    (sumWeeklyQuantities(row.weeklyValues, weekKeys) +
      sumMergedQuantities(row))
  )
}

export function createEmptyTelevisionExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): TelevisionExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    market: "",
    network: "",
    station: "",
    daypart: "",
    placement: "",
    buyType: "",
    buyingDemo: "",
    size: "30s",
    tarps: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

const TV_DESCRIPTOR_CORE: readonly (keyof TelevisionExpertScheduleRow)[] = [
  "startDate",
  "endDate",
  "market",
  "network",
  "station",
  "daypart",
  "placement",
  "buyType",
  "buyingDemo",
  "size",
  "tarps",
]

const TV_BILLING_FLAG_KEYS: readonly (keyof TelevisionExpertScheduleRow)[] = [
  "fixedCostMedia",
  "clientPaysForMedia",
  "budgetIncludesFees",
]

const TV_DESCRIPTOR_TAIL: readonly (keyof TelevisionExpertScheduleRow)[] = ["unitRate"]

function cumulativeLeftOffsets(widths: readonly number[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const w of widths) {
    out.push(acc)
    acc += w
  }
  return out
}

function formatYmdDisplay(ymd: string): string {
  if (!ymd?.trim()) return "—"
  const d = new Date(`${ymd.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return "—"
  return format(d, "dd/MM/yy")
}

export interface TelevisionExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feetelevision: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: TelevisionExpertScheduleRow[]
  onRowsChange: (rows: TelevisionExpertScheduleRow[]) => void
  /** Publisher names for network combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Station names for station combobox + fuzzy matching (typically filtered by network in standard mode). */
  tvStations?: { station?: string | null; id?: number | string | null }[]
}

const moneyOpts = { locale: "en-US" as const, currency: "USD" as const }

type TelevisionExpertFocusedCell = { rowIndex: number; columnKey: string }
type WeekDragSource =
  | {
      type: "single"
      rowIndex: number
      weekKey: string
      value: number | ""
    }
  | {
      type: "merged"
      rowIndex: number
      weekKey: string
      spanId: string
      startWeekKey: string
      endWeekKey: string
      spanLength: number
      totalQty: number
    }

type FuzzyMatchField = "network" | "station"

interface PendingFuzzyMatch {
  rowIndex: number
  field: FuzzyMatchField
  value: string
  matched: string
}

type TelevisionRowMergeSpanMeta = Readonly<{
  id: string
  startWeekKey: string
  endWeekKey: string
  totalQty: number
  spanLength: number
  weekKeysIncluded: readonly string[]
}>

type TelevisionRowMergeMap = Readonly<{
  anchorByWeekKey: Readonly<Record<string, string>>
  interiorByWeekKey: Readonly<Record<string, string>>
  spanById: Readonly<Record<string, TelevisionExpertMergedWeekSpan>>
  spanMetaByAnchorWeekKey: Readonly<Record<string, TelevisionRowMergeSpanMeta>>
}>

export function TelevisionExpertGrid({
  campaignStartDate,
  campaignEndDate,
  feetelevision,
  rows,
  onRowsChange,
  publishers = [],
  tvStations = [],
}: TelevisionExpertGridProps) {
  const { toast } = useToast()
  const domGridId = useId().replace(/:/g, "")
  const [focusedCell, setFocusedCell] = useState<TelevisionExpertFocusedCell | null>(
    null
  )
  const focusedCellRef = useRef<TelevisionExpertFocusedCell | null>(null)
  focusedCellRef.current = focusedCell

  const [rowCountInput, setRowCountInput] = useState<string>("1")
  const [pendingFuzzyMatch, setPendingFuzzyMatch] =
    useState<PendingFuzzyMatch | null>(null)
  const fuzzyMatchAutoApplyRef = useRef(false)
  const fuzzyCorrectionMapRef = useRef<Record<string, string>>({})
  const networkNames = useMemo(
    () => publishers.map((p) => p.publisher_name),
    [publishers]
  )

  const stationNames = useMemo(
    () =>
      tvStations
        .map((s) => String(s.station ?? "").trim())
        .filter((n) => n.length > 0),
    [tvStations]
  )

  const stationComboboxOptions: ComboboxOption[] = useMemo(
    () =>
      stationNames.map((name) => ({
        value: name,
        label: name,
      })),
    [stationNames]
  )

  const weekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )
  const weekKeys = useMemo(() => weekColumns.map((c) => c.weekKey), [weekColumns])

  const [weekStripSelection, setWeekStripSelection] = useState<{
    rowIndex: number
  } | null>(null)
  const [weekMultiSelect, setWeekMultiSelect] = useState<{
    rowIndex: number
    keys: string[]
  } | null>(null)
  const [weekRectSelection, setWeekRectSelection] =
    useState<TelevisionWeekRectSelection | null>(null)
  // Multi-cell selection state for copy/paste operations.
  const [multiCellSelection, setMultiCellSelection] =
    useState<TelevisionMultiCellSelection | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [copiedCells, setCopiedCells] = useState<TelevisionCopiedCells | null>(null)
  const [pendingMergeSelection, setPendingMergeSelection] = useState<{
    rowIndex: number
    keys: string[]
    anchorWeekKey: string
  } | null>(null)
  const [weekDragSource, setWeekDragSource] = useState<WeekDragSource | null>(
    null
  )
  const [weekDragOver, setWeekDragOver] = useState<{
    rowIndex: number
    weekKey: string
    valid: boolean
  } | null>(null)
  const weekAreaDragRef = useRef<{
    rowIndex: number
    weekKey: string
  } | null>(null)
  /** Latest rect set during a pointer-drag across week cells (for post-drag click handling). */
  const lastDragRectDuringGestureRef = useRef<TelevisionWeekRectSelection | null>(null)
  /**
   * After a multi-cell drag ends, the next click inside this rect only finalizes focus/anchor;
   * clicks outside clear this ref so a new selection can apply immediately.
   */
  const postDragWeekClickRectRef = useRef<TelevisionWeekRectSelection | null>(null)
  const weekRectSelectionRef = useRef<TelevisionWeekRectSelection | null>(null)
  weekRectSelectionRef.current = weekRectSelection
  const weekStripSelectionRef = useRef(weekStripSelection)
  weekStripSelectionRef.current = weekStripSelection
  const lastPendingMergeSelectionLogRef = useRef<string>("")
  const mergedAnchorInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const lastWeekAnchorRef = useRef<{ rowIndex: number; weekKey: string } | null>(
    null
  )
  /** When true, paste capture skips applying (keyboard path uses async clipboard read). */
  const suppressNextPasteApplyRef = useRef(false)

  /** Full merged span band on a row (anchor + interiors) after interior click → anchor focus. */
  const [mergeSpanHighlightPulse, setMergeSpanHighlightPulse] = useState<{
    rowIndex: number
    startWeekKey: string
    endWeekKey: string
  } | null>(null)
  const mergePulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMultiCellSelection(rectToMultiCellSelection(weekRectSelection, weekKeys))
  }, [weekRectSelection, weekKeys])

  useEffect(() => {
    return () => {
      if (mergePulseTimeoutRef.current) {
        clearTimeout(mergePulseTimeoutRef.current)
      }
    }
  }, [])

  const flashMergedSpanHighlight = useCallback(
    (rowIndex: number, startWeekKey: string, endWeekKey: string) => {
      if (mergePulseTimeoutRef.current) {
        clearTimeout(mergePulseTimeoutRef.current)
      }
      setMergeSpanHighlightPulse({ rowIndex, startWeekKey, endWeekKey })
      mergePulseTimeoutRef.current = setTimeout(() => {
        setMergeSpanHighlightPulse(null)
        mergePulseTimeoutRef.current = null
      }, 1300)
    },
    []
  )

  const tvDescriptorKeys = useMemo(
    () =>
      [
        ...TV_DESCRIPTOR_CORE,
        ...TV_BILLING_FLAG_KEYS,
        ...TV_DESCRIPTOR_TAIL,
      ] as (keyof TelevisionExpertScheduleRow)[],
    []
  )

  const descriptorColWidths = useMemo(
    () => [
      48, 48, 96, 120, 120, 110, 120, 96, 110, 80, 80, 40, 40, 40, 88,
    ],
    []
  )

  const leftOffsets = useMemo(
    () => cumulativeLeftOffsets(descriptorColWidths),
    [descriptorColWidths]
  )

  /** Full width of all descriptor columns (sticky “Weekly totals” label colspan). */
  const descriptorStickyBlockWidthPx = useMemo(
    () => descriptorColWidths.reduce((s, w) => s + w, 0),
    [descriptorColWidths]
  )

  const stickyStyleBodyDescriptorTotalLabel = useMemo(
    () => ({
      width: descriptorStickyBlockWidthPx,
      minWidth: descriptorStickyBlockWidthPx,
      maxWidth: descriptorStickyBlockWidthPx,
      boxSizing: "border-box" as const,
    }),
    [descriptorStickyBlockWidthPx]
  )

  const networkComboboxOptions: ComboboxOption[] = useMemo(
    () => networkNames.map((name) => ({ value: name, label: name })),
    [networkNames]
  )

  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const nextWeekly: ExpertWeeklyValues = {} as ExpertWeeklyValues
      for (const k of weekKeys) {
        const v = r.weeklyValues[k]
        // Expert UX: backend/default zeroes for untouched weeks should render blank.
        nextWeekly[k] = normalizeWeekValueForExpertGridBoundary(v)
      }
      return {
        ...r,
        weeklyValues: nextWeekly,
        mergedWeekSpans: Array.isArray(r.mergedWeekSpans)
          ? r.mergedWeekSpans
          : [],
      }
    })
  }, [rows, weekKeys])

  const rowMergeMaps = useMemo<readonly TelevisionRowMergeMap[]>(() => {
    const maps = normalizedRows.map((row) => {
      const anchorByWeekKey: Record<string, string> = {}
      const interiorByWeekKey: Record<string, string> = {}
      const spanById: Record<string, TelevisionExpertMergedWeekSpan> = {}
      const spanMetaByAnchorWeekKey: Record<string, TelevisionRowMergeSpanMeta> = {}
      const occupiedWeekKeys = new Set<string>()
      // A row can contain multiple non-overlapping merged groups with gaps.
      // Each accepted span contributes its own anchor/interior occupancy maps.
      for (const span of row.mergedWeekSpans ?? []) {
        if (spanById[span.id]) {
          if (DEBUG_TV_MERGE) {
            console.debug("[TV merge] occupancy duplicate span id ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
            })
          }
          continue
        }
        const keysRaw = weekKeysInSpanInclusive(
          weekKeys,
          span.startWeekKey,
          span.endWeekKey
        )
        const keys = keysRaw.filter((k) => weekKeys.includes(k))
        if (keys.length === 0) continue
        // Prefer first valid span: later overlapping/conflicting spans are ignored.
        if (keys.some((k) => occupiedWeekKeys.has(k))) {
          if (DEBUG_TV_MERGE) {
            console.debug("[TV merge] occupancy overlap ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
              keys,
            })
          }
          continue
        }
        const anchorWeekKey = keys[0]!
        anchorByWeekKey[anchorWeekKey] = span.id
        for (let i = 1; i < keys.length; i += 1) {
          interiorByWeekKey[keys[i]!] = span.id
        }
        for (const key of keys) occupiedWeekKeys.add(key)
        spanById[span.id] = span
        spanMetaByAnchorWeekKey[anchorWeekKey] = Object.freeze({
          id: span.id,
          startWeekKey: span.startWeekKey,
          endWeekKey: span.endWeekKey,
          totalQty: span.totalQty,
          spanLength: keys.length,
          weekKeysIncluded: Object.freeze([...keys]),
        })
      }
      return Object.freeze({
        anchorByWeekKey: Object.freeze(anchorByWeekKey),
        interiorByWeekKey: Object.freeze(interiorByWeekKey),
        spanById: Object.freeze(spanById),
        spanMetaByAnchorWeekKey: Object.freeze(spanMetaByAnchorWeekKey),
      })
    })
    return Object.freeze(maps)
  }, [normalizedRows, weekKeys])

  useEffect(() => {
    if (!DEBUG_TV_MERGE) return
    const nextSig = pendingMergeSelection
      ? `${pendingMergeSelection.rowIndex}:${pendingMergeSelection.keys.join(",")}:${pendingMergeSelection.anchorWeekKey}`
      : "null"
    if (lastPendingMergeSelectionLogRef.current === nextSig) return
    lastPendingMergeSelectionLogRef.current = nextSig
    console.debug("[TV merge] pending selection updated", pendingMergeSelection)
  }, [pendingMergeSelection])

  const normalizedRowsRef = useRef(normalizedRows)
  normalizedRowsRef.current = normalizedRows
  const weekMultiSelectRef = useRef(weekMultiSelect)
  weekMultiSelectRef.current = weekMultiSelect

  const pushRows = useCallback(
    (next: TelevisionExpertScheduleRow[]) => {
      const withDates = next.map((r) => ({
        ...r,
        ...deriveTelevisionExpertRowScheduleYmdFromRow(
          r,
          weekColumns,
          campaignStartDate,
          campaignEndDate
        ),
      }))
      onRowsChange(withDates)
    },
    [onRowsChange, weekColumns, campaignStartDate, campaignEndDate]
  )

  const resolveWeekDragSource = useCallback(
    (rowIndex: number, weekKey: string): WeekDragSource | null => {
      const row = normalizedRows[rowIndex]
      if (!row) return null
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey === weekKey) {
        const keys = weekKeysInSpanInclusive(
          weekKeys,
          span.startWeekKey,
          span.endWeekKey
        )
        return {
          type: "merged",
          rowIndex,
          weekKey,
          spanId: span.id,
          startWeekKey: span.startWeekKey,
          endWeekKey: span.endWeekKey,
          spanLength: keys.length,
          totalQty: span.totalQty,
        }
      }
      if (span && span.startWeekKey !== weekKey) return null
      const value = row.weeklyValues[weekKey]
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (typeof value === "number" && value === 0)
      ) {
        return null
      }
      return {
        type: "single",
        rowIndex,
        weekKey,
        value,
      }
    },
    [normalizedRows, weekKeys]
  )

  const validateWeekDropTarget = useCallback(
    (
      drag: WeekDragSource,
      targetRowIndex: number,
      targetWeekKey: string
    ): { ok: boolean; reason?: string } => {
      const targetRow = normalizedRows[targetRowIndex]
      if (!targetRow) return { ok: false, reason: "Target row is unavailable." }
      const targetRowMergeMap = rowMergeMaps[targetRowIndex]
      const targetAnchorSpanId = targetRowMergeMap?.anchorByWeekKey[targetWeekKey]
      const targetInteriorSpanId = targetRowMergeMap?.interiorByWeekKey[targetWeekKey]
      const targetMembership: "anchor" | "interior" | "none" = targetInteriorSpanId
        ? "interior"
        : targetAnchorSpanId
          ? "anchor"
          : "none"
      if (targetMembership === "interior") {
        return { ok: false, reason: "Cannot drop into interior merged weeks." }
      }
      if (drag.type === "single") {
        if (drag.rowIndex === targetRowIndex && drag.weekKey === targetWeekKey) {
          return { ok: false, reason: "Same source and destination cell." }
        }
        if (targetMembership !== "none") {
          return {
            ok: false,
            reason: "Dropping onto merged anchors is not supported in phase 1.",
          }
        }
        return { ok: true }
      }
      const startIdx = weekKeys.indexOf(targetWeekKey)
      if (startIdx < 0) return { ok: false, reason: "Invalid target week." }
      const endIdx = startIdx + drag.spanLength - 1
      if (endIdx >= weekKeys.length) {
        return {
          ok: false,
          reason: "Merged span does not fit from this starting week.",
        }
      }
      for (let wi = startIdx; wi <= endIdx; wi++) {
        const wk = weekKeys[wi]!
        const existingSpanId =
          targetRowMergeMap?.anchorByWeekKey[wk] ??
          targetRowMergeMap?.interiorByWeekKey[wk]
        if (!existingSpanId) continue
        const isOwnSpan =
          targetRowIndex === drag.rowIndex && existingSpanId === drag.spanId
        if (!isOwnSpan) {
          return {
            ok: false,
            reason: "Target range overlaps another merged span.",
          }
        }
      }
      return { ok: true }
    },
    [normalizedRows, rowMergeMaps, weekKeys]
  )

  const clearWeekDragUiState = useCallback(() => {
    setWeekDragSource(null)
    setWeekDragOver(null)
  }, [])

  const resetTransientWeekUiState = useCallback(
    (options?: { preserveFocus?: boolean; preserveMergePulse?: boolean }) => {
      setWeekStripSelection(null)
      setWeekMultiSelect(null)
      setWeekRectSelection(null)
      setMultiCellSelection(null)
      setCopiedCells(null)
      setIsSelecting(false)
      setPendingMergeSelection(null)
      setWeekDragSource(null)
      setWeekDragOver(null)
      lastWeekAnchorRef.current = null
      weekAreaDragRef.current = null
      lastDragRectDuringGestureRef.current = null
      postDragWeekClickRectRef.current = null

      if (!options?.preserveMergePulse) {
        setMergeSpanHighlightPulse(null)
      }

      if (!options?.preserveFocus) {
        const focused = focusedCellRef.current
        if (focused && weekKeys.includes(focused.columnKey)) {
          focusedCellRef.current = null
          setFocusedCell(null)
        }
      }
    },
    [weekKeys]
  )

  const updateRow = useCallback(
    (rowIndex: number, patch: Partial<TelevisionExpertScheduleRow>) => {
      const next = normalizedRows.map((r, i) =>
        i === rowIndex ? { ...r, ...patch } : r
      )
      pushRows(next)
    },
    [normalizedRows, pushRows]
  )

  const tryFuzzyMatch = useCallback(
    (rowIndex: number, field: FuzzyMatchField, value: string) => {
      if (!value.trim()) return
      const corrKey = `${field}:${value.trim().toLowerCase()}`
      const corrected = fuzzyCorrectionMapRef.current[corrKey]
      if (corrected) {
        updateRow(rowIndex, { [field]: corrected } as Partial<TelevisionExpertScheduleRow>)
        return
      }
      let match: { matched: string } | null = null
      if (field === "network") {
        match = fuzzyMatchNetwork(value, networkNames)
      } else if (field === "station") {
        match = fuzzyMatchStation(value, stationNames)
      }
      if (!match) return
      if (fuzzyMatchAutoApplyRef.current) {
        updateRow(rowIndex, { [field]: match.matched } as Partial<TelevisionExpertScheduleRow>)
      } else {
        setPendingFuzzyMatch({
          rowIndex,
          field,
          value: value.trim(),
          matched: match.matched,
        })
      }
    },
    [networkNames, stationNames, updateRow]
  )

  const handleFuzzyMatchConfirm = useCallback(
    (enableAutoMatch: boolean) => {
      if (!pendingFuzzyMatch) return
      const { field, matched, value } = pendingFuzzyMatch
      const key = `${field}:${value.trim().toLowerCase()}`
      if (enableAutoMatch) {
        fuzzyMatchAutoApplyRef.current = true
        fuzzyCorrectionMapRef.current[key] = matched
      }
      const targetNorm = value.trim().toLowerCase()
      const next = normalizedRows.map((r) => {
        const cur = String(r[field] ?? "")
        if (cur.trim().toLowerCase() === targetNorm) {
          return { ...r, [field]: matched }
        }
        return r
      })
      pushRows(next)
      setPendingFuzzyMatch(null)
    },
    [pendingFuzzyMatch, normalizedRows, pushRows]
  )

  const handleRowCountBlur = useCallback(() => {
    if (rowCountInput === "") {
      setRowCountInput("1")
      return
    }
    const n = Math.max(1, Math.min(500, parseInt(rowCountInput, 10) || 1))
    setRowCountInput(String(n))
  }, [rowCountInput])

  const navColCount =
    tvDescriptorKeys.length + WEEK_GRID_COL_OFFSET + weekKeys.length
  const firstWeekNavColIndex = tvDescriptorKeys.length + WEEK_GRID_COL_OFFSET
  const unitRateNavColIndex = tvDescriptorKeys.indexOf("unitRate")

  const stickyThCorner = (className?: string) =>
    cn(
      "sticky top-0 border-b border-r px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm",
      className
    )

  const stickyThWeek = cn(
    "sticky top-0 z-[55] border-b border-r px-1 py-3.5 text-center text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm align-middle"
  )

  const stickyTd = (index: number, className?: string) =>
    cn(
      "border-b border-r bg-inherit px-1 py-0.5 align-middle",
      className
    )

  const stickyStyleBody = (index: number) => ({
    width: descriptorColWidths[index],
    minWidth: descriptorColWidths[index],
    maxWidth: descriptorColWidths[index],
    boxSizing: "border-box" as const,
  })

  const stickyStyleHeaderCorner = (index: number) => ({
    width: descriptorColWidths[index],
    minWidth: descriptorColWidths[index],
    maxWidth: descriptorColWidths[index],
    boxSizing: "border-box" as const,
  })

  const handleGridInputKeyDown = useCallback(
    (
      rowIndex: number,
      colIndex: number,
      e: KeyboardEvent<HTMLInputElement>
    ) => {
      const t = e.currentTarget
      const isDate = t.type === "date"
      if (
        e.key === "ArrowRight" &&
        !isDate &&
        colIndex === unitRateNavColIndex &&
        unitRateNavColIndex >= 0
      ) {
        const len = t.value.length
        const start = t.selectionStart ?? 0
        const end = t.selectionEnd ?? 0
        if (start === len && end === len) {
          e.preventDefault()
          focusExpertGridCell(domGridId, rowIndex, firstWeekNavColIndex)
          return
        }
      }
      if (
        e.key === "ArrowLeft" &&
        !isDate &&
        colIndex === firstWeekNavColIndex
      ) {
        const start = t.selectionStart ?? 0
        const end = t.selectionEnd ?? 0
        if (start === 0 && end === 0 && unitRateNavColIndex >= 0) {
          e.preventDefault()
          focusExpertGridCell(domGridId, rowIndex, unitRateNavColIndex)
          return
        }
      }
      handleExpertGridInputKeyDown({
        gridId: domGridId,
        rowIndex,
        colIndex,
        rowCount: normalizedRows.length,
        colCount: navColCount,
        event: e,
      })
    },
    [
      domGridId,
      firstWeekNavColIndex,
      navColCount,
      normalizedRows.length,
      unitRateNavColIndex,
    ]
  )

  const updateWeeklyCell = useCallback(
    (rowIndex: number, weekKey: string, raw: string) => {
      const row = normalizedRows[rowIndex]
      if (!row) return
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey !== weekKey) return

      const cleaned = raw.replace(/[^\d.-]/g, "")
      if (cleaned === "" || cleaned === "-") {
        if (span) {
          // Preserve merge topology on edit clear/delete; only the X control unmerges.
          const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
            s.id === span.id ? { ...s, totalQty: 0 } : s
          )
          pushRows(
            normalizedRows.map((r, i) =>
              i === rowIndex ? { ...r, mergedWeekSpans } : r
            )
          )
          return
        }
        const weeklyValues = { ...row.weeklyValues, [weekKey]: "" as const }
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, weeklyValues } : r
          )
        )
        return
      }
      const n = Number.parseFloat(cleaned)
      if (!Number.isFinite(n)) return
      if (span) {
        const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
          s.id === span.id ? { ...s, totalQty: n } : s
        )
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, mergedWeekSpans } : r
          )
        )
        return
      }
      const weeklyValues = { ...row.weeklyValues, [weekKey]: n }
      pushRows(
        normalizedRows.map((r, i) => (i === rowIndex ? { ...r, weeklyValues } : r))
      )
    },
    [normalizedRows, pushRows, weekKeys]
  )

  const unmergeWeekSpan = useCallback(
    (rowIndex: number, spanId: string) => {
      const row = normalizedRows[rowIndex]
      if (!row) return
      // Dedicated and only destructive merge removal path.
      // Remove only the chosen span; all other merged groups on this row are preserved.
      const mergedWeekSpans = (row.mergedWeekSpans ?? []).filter(
        (span) => span.id !== spanId
      )
      pushRows(
        normalizedRows.map((r, i) =>
          i === rowIndex ? { ...r, mergedWeekSpans } : r
        )
      )
      resetTransientWeekUiState()
      if (DEBUG_TV_MERGE) {
        console.debug("[TV merge] unmerge applied", { rowIndex, spanId })
      }
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const addRow = useCallback(() => {
    const parsed = Math.max(
      1,
      Math.min(500, parseInt(rowCountInput, 10) || 1)
    )
    const idPrefix =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tv-expert-${Date.now()}`
    const newRows = Array.from({ length: parsed }, (_, i) =>
      createEmptyTelevisionExpertRow(
        `${idPrefix}-${i}`,
        campaignStartDate,
        campaignEndDate,
        weekKeys
      )
    )
    const next = [...normalizedRows, ...newRows]
    pushRows(next)
    resetTransientWeekUiState()
    setRowCountInput(String(parsed))
  }, [
    campaignStartDate,
    campaignEndDate,
    normalizedRows,
    pushRows,
    resetTransientWeekUiState,
    rowCountInput,
    weekKeys,
  ])

  const duplicateRow = useCallback(
    (rowIndex: number) => {
      const source = normalizedRows[rowIndex]
      if (!source) return
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `tv-expert-${Date.now()}-${rowIndex}`
      const weeklyValues = { ...source.weeklyValues }
      const mergedWeekSpans = (source.mergedWeekSpans ?? []).map((s, i) => ({
        ...s,
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `sp-${Date.now()}-${i}`,
      }))
      pushRows([
        ...normalizedRows.slice(0, rowIndex + 1),
        { ...source, id, weeklyValues, mergedWeekSpans },
        ...normalizedRows.slice(rowIndex + 1),
      ])
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const clearPendingMergeSelection = useCallback((reason: string) => {
    // Sticky by default: only explicit reset paths should clear merge intent.
    setPendingMergeSelection((prev) => {
      if (!prev) return prev
      void reason
      return null
    })
  }, [])

  /** Clears only week-area state that involves this merged anchor (not other rows/ranges). */
  const clearWeekSelectionWhereMergedAnchorInvolved = useCallback(
    (rowIndex: number, weekKey: string) => {
      setWeekRectSelection((prev) =>
        prev && tvWeekCellInRect(rowIndex, weekKey, prev, weekKeys)
          ? null
          : prev
      )
      setWeekMultiSelect((prev) =>
        prev &&
        prev.rowIndex === rowIndex &&
        prev.keys.includes(weekKey)
          ? null
          : prev
      )
      setWeekStripSelection((prev) =>
        prev && prev.rowIndex === rowIndex ? null : prev
      )
      setPendingMergeSelection((p) => {
        if (!p || p.rowIndex !== rowIndex) return p
        if (p.keys.includes(weekKey)) return null
        return p
      })
      postDragWeekClickRectRef.current = null
      weekAreaDragRef.current = null
    },
    [weekKeys]
  )

  /** Single interaction gateway for merged anchors: edit focus only, no week-range selection. */
  const focusMergedAnchorEditSurface = useCallback(
    (rowIndex: number, weekKey: string, e?: React.SyntheticEvent) => {
      e?.preventDefault()
      e?.stopPropagation()
      clearWeekSelectionWhereMergedAnchorInvolved(rowIndex, weekKey)
      lastWeekAnchorRef.current = { rowIndex, weekKey }
      mergedAnchorInputRefs.current[`${rowIndex}:${weekKey}`]?.focus()
    },
    [clearWeekSelectionWhereMergedAnchorInvolved]
  )

  const deleteRow = useCallback(
    (rowIndex: number) => {
      if (normalizedRows.length <= 1) return
      pushRows(normalizedRows.filter((_, i) => i !== rowIndex))
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const toggleWeekMultiSelect = useCallback(
    (rowIndex: number, weekKey: string) => {
      setWeekRectSelection(null)
      setWeekMultiSelect((prev) => {
        if (!prev || prev.rowIndex !== rowIndex) {
          return { rowIndex, keys: [weekKey] }
        }
        const set = new Set(prev.keys)
        if (set.has(weekKey)) set.delete(weekKey)
        else set.add(weekKey)
        const keys = sortWeekKeysByTimeline([...set], weekKeys)
        return { rowIndex, keys }
      })
      setWeekStripSelection(null)
    },
    [weekKeys]
  )

  const rangeWeekMultiSelect = useCallback(
    (rowIndex: number, anchorKey: string, endKey: string) => {
      const i0 = weekKeys.indexOf(anchorKey)
      const i1 = weekKeys.indexOf(endKey)
      if (i0 < 0 || i1 < 0) return
      const lo = Math.min(i0, i1)
      const hi = Math.max(i0, i1)
      setWeekMultiSelect({
        rowIndex,
        keys: weekKeys.slice(lo, hi + 1),
      })
      setWeekRectSelection(
        normalizeTelevisionWeekRect(rowIndex, anchorKey, rowIndex, endKey, weekKeys)
      )
      setWeekStripSelection(null)
    },
    [weekKeys]
  )

  const lockPendingMergeSelectionFromCurrentSelection = useCallback(() => {
    const n = deriveTelevisionMergeEligibility(
      weekRectSelectionRef.current,
      weekMultiSelectRef.current,
      weekKeys
    )
    if (!n || n.orderedWeekKeys.length < 2) return
    setPendingMergeSelection((prev) => {
      const next = {
        rowIndex: n.rowIndex,
        keys: n.orderedWeekKeys,
        anchorWeekKey: n.anchorWeekKey,
      }
      if (
        prev &&
        prev.rowIndex === next.rowIndex &&
        prev.anchorWeekKey === next.anchorWeekKey &&
        prev.keys.length === next.keys.length &&
        prev.keys.every((k, i) => k === next.keys[i])
      ) {
        return prev
      }
      return next
    })
  }, [weekKeys])

  useEffect(() => {
    lockPendingMergeSelectionFromCurrentSelection()
  }, [
    weekRectSelection,
    weekMultiSelect,
    lockPendingMergeSelectionFromCurrentSelection,
  ])

  const derivedMergeTarget = useMemo(() => {
    const n = deriveTelevisionMergeEligibility(weekRectSelection, weekMultiSelect, weekKeys)
    if (!n || n.orderedWeekKeys.length < 2) return null
    return { rowIndex: n.rowIndex, keys: n.orderedWeekKeys }
  }, [weekRectSelection, weekMultiSelect, weekKeys])

  const mergeTarget = useMemo(() => {
    if (!derivedMergeTarget || derivedMergeTarget.keys.length < 2) {
      return null
    }
    const sorted = sortWeekKeysByTimeline([...derivedMergeTarget.keys], weekKeys)
    if (sorted.length < 2 || !weekKeysAreContiguous(sorted, weekKeys)) {
      return null
    }
    const rowIndex = derivedMergeTarget.rowIndex
    const row = normalizedRows[rowIndex]
    if (!row) return null
    if (selectionOverlapsMergedSpan(rowMergeMaps[rowIndex], sorted, weekKeys)) {
      return null
    }
    return { rowIndex, keys: sorted }
  }, [derivedMergeTarget, normalizedRows, rowMergeMaps, weekKeys])
  const mergeTargetRef = useRef(mergeTarget)
  mergeTargetRef.current = mergeTarget

  useEffect(() => {
    const endDrag = () => {
      setIsSelecting(false)
      const r = lastDragRectDuringGestureRef.current
      lastDragRectDuringGestureRef.current = null
      weekAreaDragRef.current = null
      const multiCellDrag =
        Boolean(r) &&
        !(
          r!.rowStart === r!.rowEnd && r!.weekKeyStart === r!.weekKeyEnd
        )
      if (multiCellDrag) {
        postDragWeekClickRectRef.current = r
      } else {
        postDragWeekClickRectRef.current = null
      }
      if (DEBUG_TV_MERGE) {
        console.debug("[TV merge] drag end", {
          lastRect: r,
          postDragClickGuard: multiCellDrag,
        })
      }
    }
    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)
    return () => {
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false)
    }
    document.addEventListener("mouseup", handleMouseUp)
    return () => document.removeEventListener("mouseup", handleMouseUp)
  }, [])

  const handleMergeSelectedWeeks = useCallback(() => {
    // Prefer current selection so users can merge any contiguous week combo on any row.
    const n = deriveTelevisionMergeEligibility(
      weekRectSelectionRef.current,
      weekMultiSelectRef.current,
      weekKeys
    )
    const sel =
      n && n.orderedWeekKeys.length >= 2
        ? {
            rowIndex: n.rowIndex,
            keys: n.orderedWeekKeys,
            anchorWeekKey: n.anchorWeekKey,
          }
        : null
    if (!sel || sel.keys.length < 2) {
      const r = weekRectSelectionRef.current
      if (r && r.rowStart !== r.rowEnd) {
        toast({
          variant: "destructive",
          title: "Merge one row only",
          description:
            "Select contiguous weeks on a single row. Multi-row selections are for copy and paste.",
        })
      }
      return
    }
    const sorted = sortWeekKeysByTimeline(sel.keys, weekKeys)
    if (!weekKeysAreContiguous(sorted, weekKeys)) {
      toast({
        variant: "destructive",
        title: "Contiguous weeks only",
        description:
          "Select adjacent weeks on one line (use Shift+click for a range).",
      })
      return
    }
    const rowIndex = sel.rowIndex
    const rowsNow = normalizedRowsRef.current
    const row = rowsNow[rowIndex]
    if (!row) return
    if (selectionOverlapsMergedSpan(rowMergeMaps[rowIndex], sorted, weekKeys)) {
      if (DEBUG_TV_MERGE) {
        console.debug("[TV merge] validation overlap failure", {
          rowIndex,
          selectedWeekKeys: sorted,
        })
      }
      toast({
        variant: "destructive",
        title: "Selection overlaps a merged block",
        description:
          "Leave at least one unmerged week between groups, or unmerge the existing block first.",
      })
      return
    }
    let sum = 0
    for (const k of sorted) {
      sum += parseNum(row.weeklyValues[k])
    }
    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `merge-${Date.now()}`
    const newSpan: TelevisionExpertMergedWeekSpan = {
      id: newId,
      startWeekKey: sorted[0]!,
      endWeekKey: sorted[sorted.length - 1]!,
      totalQty: sum,
    }
    const weeklyValues = { ...row.weeklyValues }
    for (const k of sorted) weeklyValues[k] = ""
    // Append-only for merge topology: existing non-overlapping spans on this row remain untouched.
    const mergedWeekSpans = [...(row.mergedWeekSpans ?? []), newSpan]
    if (DEBUG_TV_MERGE) {
      console.debug("[TV merge] merge applied", {
        rowIndex,
        spanId: newSpan.id,
        startWeekKey: newSpan.startWeekKey,
        endWeekKey: newSpan.endWeekKey,
        totalQty: newSpan.totalQty,
        mergedWeekKeys: sorted,
      })
    }
    pushRows(
      rowsNow.map((r, i) =>
        i === rowIndex ? { ...r, weeklyValues, mergedWeekSpans } : r
      )
    )
    resetTransientWeekUiState()
    toast({
      title: "Weeks merged",
      description: `Merged ${sorted.length} weeks into one burst. Edit the value or click the red ✕ to unmerge.`,
    })
  }, [pushRows, resetTransientWeekUiState, rowMergeMaps, toast, weekKeys])

  const mergeWeeksReady =
    mergeTarget !== null &&
    mergeTarget.keys.length >= 2 &&
    weekKeysAreContiguous(mergeTarget.keys, weekKeys)

  useEffect(() => {
    if (!mergeWeeksReady || !mergeTarget) return
    const lastKey = mergeTarget.keys[mergeTarget.keys.length - 1]
    if (!lastKey) return
    const lastWi = weekKeys.indexOf(lastKey)
    if (lastWi < 0) return
    const cellId = expertGridCellId(
      domGridId,
      mergeTarget.rowIndex,
      tvDescriptorKeys.length + WEEK_GRID_COL_OFFSET + lastWi
    )
    document
      .getElementById(cellId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [domGridId, mergeTarget, mergeWeeksReady, tvDescriptorKeys.length, weekKeys])

  useEffect(() => {
    if (!DEBUG_TV_MERGE) return
    console.debug("[TV merge] merge eligibility derived", {
      mergeTarget,
      derivedMergeTarget,
      mergeWeeksReady,
      weekRectSelection,
      weekMultiSelect,
    })
  }, [
    mergeTarget,
    derivedMergeTarget,
    mergeWeeksReady,
    weekRectSelection,
    weekMultiSelect,
  ])

  const gridScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDocumentPointerDown = (ev: PointerEvent) => {
      const root = gridScrollRef.current
      if (!root) return
      const target = ev.target
      if (!(target instanceof Node)) return
      if (!root.contains(target)) {
        resetTransientWeekUiState()
      }
    }
    window.addEventListener("pointerdown", handleDocumentPointerDown, true)
    return () => {
      window.removeEventListener("pointerdown", handleDocumentPointerDown, true)
    }
  }, [resetTransientWeekUiState])

  const handleCellFocus = useCallback((rowIndex: number, columnKey: string) => {
    const next = { rowIndex, columnKey }
    focusedCellRef.current = next
    setFocusedCell(next)
  }, [])

  const pasteMatrixIntoGrid = useCallback(
    (matrix: string[][]) => {
      if (!matrix || matrix.length === 0) return

      const fc = focusedCellRef.current
      if (!fc) {
        toast({
          variant: "destructive",
          title: "Paste skipped",
          description:
            "Focus a cell in the grid before pasting from Excel.",
        })
        return
      }

      const anchor = anchorPasteColumnFromKey(
        fc.columnKey,
        tvDescriptorKeys,
        weekKeys
      )
      if (anchor === null) {
        toast({
          variant: "destructive",
          title: "Paste skipped",
          description:
            "Focus a cell in the grid before pasting from Excel.",
        })
        return
      }

      const fcIsWeek = weekKeys.includes(fc.columnKey)

      if (fcIsWeek) {
        let working = trimEmptyEdgeColumns(matrix)
        if (working.length === 0) return

        const nextRows: TelevisionExpertScheduleRow[] = normalizedRows.map((r) => ({
          ...r,
          weeklyValues: { ...r.weeklyValues },
          mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
        }))

        const { applied, errorReasons, layout, usedWeekAlignmentToast } =
          applyWeeklyPasteMatrixToSelection({
            matrix: working,
            weekColumns,
            anchorRow: fc.rowIndex,
            anchorWeekKey: fc.columnKey,
            weekRectSelection: weekRectSelectionRef.current,
            weekStripSelection: weekStripSelectionRef.current,
            weekMultiSelect: weekMultiSelectRef.current,
            weekKeys,
            rowCount: normalizedRows.length,
            nextRows,
          })

        if (applied > 0) {
          pushRows(nextRows)
          if (usedWeekAlignmentToast) {
            toast({
              title: "Weeks aligned",
              description:
                "Pasted weeks were aligned to the closest campaign weeks.",
            })
          }
          if (layout !== "direct") {
            if (layout === "tile") {
              toast({
                title: "Pattern repeated across selection",
                description:
                  "Clipboard values were tiled or repeated to fill the selected weeks.",
              })
            } else {
              toast({
                title: "Paste clipped to selection",
                description:
                  "Only the top-left part of the clipboard fit the selected area.",
              })
            }
          }
        }

        const uniqueErrors = [...new Set(errorReasons)]
        if (uniqueErrors.length > 0) {
          const preview = uniqueErrors.slice(0, 2).join(" ")
          toast({
            variant: "destructive",
            title: "Some pasted values were skipped",
            description: `${preview}${uniqueErrors.length > 2 ? " …" : ""}`,
          })
        }
        return
      }

      let working = trimEmptyEdgeColumns(matrix)
      if (working.length === 0) return

      const anchorRow = fc.rowIndex

      const nextRows: TelevisionExpertScheduleRow[] = normalizedRows.map((r) => ({
        ...r,
        weeklyValues: { ...r.weeklyValues },
        mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
      }))

      let applied = 0
      const errorReasons: string[] = []

      for (let dr = 0; dr < working.length; dr++) {
        const targetRow = anchorRow + dr
        if (targetRow < 0 || targetRow >= nextRows.length) continue

        const pasteRow = working[dr] ?? []
        for (let dc = 0; dc < pasteRow.length; dc++) {
          const raw = pasteRow[dc] ?? ""
          const pasteCol = anchor + dc
          const target = resolvePasteColumn(
            pasteCol,
            tvDescriptorKeys,
            weekKeys
          )
          if (!target) continue

          const cur = nextRows[targetRow]

          if (target.kind === "week") {
            const res = parseWeeklyPasteValue(raw)
            if (!res.ok) {
              errorReasons.push(res.reason)
              continue
            }
            const sp = findMergedSpanForWeek(cur, target.weekKey, weekKeys)
            if (sp && sp.startWeekKey !== target.weekKey) {
              continue
            }
            if (sp && sp.startWeekKey === target.weekKey) {
              // Preserve merged spans in generic paste flow; empty paste zeroes quantity.
              const nextQty = res.value === "" ? 0 : (res.value as number)
              nextRows[targetRow] = {
                ...cur,
                mergedWeekSpans: (cur.mergedWeekSpans ?? []).map((s) =>
                  s.id === sp.id ? { ...s, totalQty: nextQty } : s
                ),
              }
              applied += 1
              continue
            }
            nextRows[targetRow] = {
              ...cur,
              weeklyValues: { ...cur.weeklyValues, [target.weekKey]: res.value },
            }
            applied += 1
            continue
          }

          const field = target.field as keyof TelevisionExpertScheduleRow
          if (field === "startDate" || field === "endDate") {
            continue
          }
          if (field === "unitRate") {
            const res = parseRatePasteValue(raw)
            if (!res.ok) {
              errorReasons.push(res.reason)
              continue
            }
            nextRows[targetRow] = { ...cur, unitRate: res.value }
            applied += 1
          } else if (
            field === "fixedCostMedia" ||
            field === "clientPaysForMedia" ||
            field === "budgetIncludesFees"
          ) {
            const v = raw.trim().toLowerCase()
            const truthy =
              v === "true" || v === "1" || v === "yes" || v === "y"
            nextRows[targetRow] = {
              ...cur,
              [field]: truthy,
            } as TelevisionExpertScheduleRow
            applied += 1
          } else if (field === "buyType") {
            nextRows[targetRow] = {
              ...cur,
              buyType: normalizeTelevisionBuyTypePaste(raw),
            }
            applied += 1
          } else if (field === "tarps") {
            const res = parseRatePasteValue(raw)
            if (!res.ok) {
              errorReasons.push(res.reason)
              continue
            }
            nextRows[targetRow] = {
              ...cur,
              tarps: res.value === undefined ? "" : String(res.value),
            }
            applied += 1
          } else if (field === "network") {
            nextRows[targetRow] = {
              ...cur,
              network: normalizeTelevisionNetworkPaste(raw, networkNames),
            }
            applied += 1
          } else if (field === "station") {
            nextRows[targetRow] = {
              ...cur,
              station: normalizeTelevisionStationPaste(raw, stationNames),
            }
            applied += 1
          } else {
            const v = raw.trim()
            nextRows[targetRow] = { ...cur, [field]: v } as TelevisionExpertScheduleRow
            applied += 1
          }
        }
      }

      if (applied > 0) {
        pushRows(nextRows)
      }

      const uniqueErrors = [...new Set(errorReasons)]
      if (uniqueErrors.length > 0) {
        const preview = uniqueErrors.slice(0, 2).join(" ")
        toast({
          variant: "destructive",
          title: "Some pasted values were skipped",
          description: `${preview}${uniqueErrors.length > 2 ? " …" : ""}`,
        })
      }
    },
    [
      normalizedRows,
      networkNames,
      stationNames,
      tvDescriptorKeys,
      pushRows,
      toast,
      weekColumns,
      weekKeys,
    ]
  )

  const copySelectedWeekRangeToClipboard = useCallback(async (): Promise<boolean> => {
    const rows = normalizedRowsRef.current
    const sel = resolveWeeklyExportSelection(
      weekRectSelectionRef.current,
      weekStripSelectionRef.current,
      mergeTargetRef.current,
      focusedCellRef.current,
      weekKeys,
      rows
    )
    if (!sel) return false
    const text = buildWeeklyExportTsv(sel, rows, weekKeys)
    if (!text) return false
    const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
    const matrix = text.split("\n").map((line) => line.split("\t"))
    try {
      await navigator.clipboard.writeText(text)
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
      return true
    } catch {
      return false
    }
  }, [weekKeys])

  const cutSelectedWeekRangeToClipboard = useCallback(async (): Promise<boolean> => {
    const rows = normalizedRowsRef.current
    const sel = resolveWeeklyExportSelection(
      weekRectSelectionRef.current,
      weekStripSelectionRef.current,
      mergeTargetRef.current,
      focusedCellRef.current,
      weekKeys,
      rows
    )
    if (!sel) return false
    const text = buildWeeklyExportTsv(sel, rows, weekKeys)
    if (!text) return false
    const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
    const matrix = text.split("\n").map((line) => line.split("\t"))
    try {
      await navigator.clipboard.writeText(text)
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
    } catch {
      return false
    }
    const next = applyWeeklyCutToRows(sel, rows, weekKeys)
    if (!next) return true
    pushRows(next)
    switch (sel.kind) {
      case "rect":
      case "mergeContiguous":
        setWeekRectSelection(null)
        setWeekMultiSelect(null)
        break
      case "strip":
        setWeekStripSelection(null)
        break
      default:
        break
    }
    return true
  }, [pushRows, weekKeys])

  const handlePasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      if (suppressNextPasteApplyRef.current) {
        suppressNextPasteApplyRef.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()

      const plainText = e.clipboardData.getData("text/plain")
      const plainMatrix = parseClipboardToMatrix(plainText)
      let matrix =
        plainMatrix.length > 0
          ? plainMatrix
          : clipboardMatrixFromDataTransfer(e.clipboardData)
      if (!matrix || matrix.length === 0) return
      matrix = trimEmptyEdgeColumns(matrix)
      if (matrix.length === 0) return
      pasteMatrixIntoGrid(matrix)
    },
    [pasteMatrixIntoGrid]
  )

  const handleGridKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const root = gridScrollRef.current
      if (!root) return
      const t = e.target
      if (!(t instanceof Node) || !root.contains(t)) return

      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === "c") {
        const sel = resolveWeeklyExportSelection(
          weekRectSelectionRef.current,
          weekStripSelectionRef.current,
          mergeTargetRef.current,
          focusedCellRef.current,
          weekKeys,
          normalizedRowsRef.current
        )
        if (sel) {
          e.preventDefault()
          e.stopPropagation()
          void copySelectedWeekRangeToClipboard()
        }
        return
      }

      if (key === "x") {
        const sel = resolveWeeklyExportSelection(
          weekRectSelectionRef.current,
          weekStripSelectionRef.current,
          mergeTargetRef.current,
          focusedCellRef.current,
          weekKeys,
          normalizedRowsRef.current
        )
        if (sel) {
          e.preventDefault()
          e.stopPropagation()
          void cutSelectedWeekRangeToClipboard()
        }
        return
      }

      if (key === "v") {
        const fc = focusedCellRef.current
        const fcIsWeek = Boolean(
          fc && weekKeys.includes(fc.columnKey)
        )

        if (!fcIsWeek) {
          return
        }

        e.preventDefault()
        e.stopPropagation()
        suppressNextPasteApplyRef.current = true
        window.setTimeout(() => {
          if (suppressNextPasteApplyRef.current) {
            suppressNextPasteApplyRef.current = false
          }
        }, 0)
        void (async () => {
          let matrix = await readClipboardMatrixAsync()
          if (!matrix?.length) return
          matrix = trimEmptyEdgeColumns(matrix)
          if (!matrix.length) return
          pasteMatrixIntoGrid(matrix)
        })()
      }
    },
    [
      copySelectedWeekRangeToClipboard,
      cutSelectedWeekRangeToClipboard,
      pasteMatrixIntoGrid,
      weekKeys,
    ]
  )

  const handleCopyCapture = useCallback(
    (e: React.ClipboardEvent) => {
      const rows = normalizedRowsRef.current
      const sel = resolveWeeklyExportSelection(
        weekRectSelectionRef.current,
        weekStripSelectionRef.current,
        mergeTargetRef.current,
        focusedCellRef.current,
        weekKeys,
        rows
      )
      if (!sel) return
      const text = buildWeeklyExportTsv(sel, rows, weekKeys)
      if (!text) return
      const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
      const matrix = text.split("\n").map((line) => line.split("\t"))
      e.preventDefault()
      e.stopPropagation()
      e.clipboardData.setData("text/plain", text)
      void navigator.clipboard.writeText(text).catch(() => {})
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
    },
    [weekKeys]
  )

  const handleCutCapture = useCallback(
    (e: React.ClipboardEvent) => {
      const rows = normalizedRowsRef.current
      const sel = resolveWeeklyExportSelection(
        weekRectSelectionRef.current,
        weekStripSelectionRef.current,
        mergeTargetRef.current,
        focusedCellRef.current,
        weekKeys,
        rows
      )
      if (!sel) return
      const text = buildWeeklyExportTsv(sel, rows, weekKeys)
      if (!text) return
      const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
      const matrix = text.split("\n").map((line) => line.split("\t"))
      e.preventDefault()
      e.stopPropagation()
      e.clipboardData.setData("text/plain", text)
      void navigator.clipboard.writeText(text).catch(() => {})
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
      const next = applyWeeklyCutToRows(sel, rows, weekKeys)
      if (next) {
        pushRows(next)
        switch (sel.kind) {
          case "rect":
          case "mergeContiguous":
            setWeekRectSelection(null)
            setWeekMultiSelect(null)
            break
          case "strip":
            setWeekStripSelection(null)
            break
          default:
            break
        }
      }
    },
    [pushRows, weekKeys]
  )

  const containerTotals = useMemo(() => {
    let sumGross = 0
    let sumQty = 0
    const perWeek: Record<string, number> = {}
    for (const k of weekKeys) perWeek[k] = 0

    for (const row of normalizedRows) {
      sumGross += rowGrossCost(row, weekKeys)
      for (const k of weekKeys) {
        const q = parseNum(row.weeklyValues[k])
        perWeek[k] += q
        sumQty += q
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

    const fee =
      feetelevision > 0 && feetelevision < 100 ? (sumGross * feetelevision) / (100 - feetelevision) : 0
    const totalWithFee = sumGross + fee

    return { sumGross, sumQty, perWeek, fee, totalWithFee }
  }, [feetelevision, normalizedRows, weekKeys])

  const descriptorHeadLabels = useMemo(() => {
    const core = [
      "Start Date",
      "End Date",
      "Market",
      "Network",
      "Station",
      "Daypart",
      "Placement",
      "Buy Type",
      "Buying Demo",
      "Creative Length",
      "TARPs",
    ]
    const billing = [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees",
    ]
    const tail = ["Unit Rate", "Net Media", "", "Σ qty"]
    return [...core, ...billing, ...tail]
  }, [])

  const colIndexOf = useCallback(
    (key: keyof TelevisionExpertScheduleRow) => tvDescriptorKeys.indexOf(key),
    [tvDescriptorKeys]
  )

  const campaignRangeLabel = `${format(campaignStartDate, "MMM d, yyyy")} – ${format(campaignEndDate, "MMM d, yyyy")}`

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="relative overflow-hidden border-0 shadow-md">
        <div className="flex min-w-0 flex-row">
          <div
            className="w-1 shrink-0 self-stretch"
            style={{ backgroundColor: MEDIA_ACCENT_HEX }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/5 pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">
            Television — Expert Schedule
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="tv-expert-row-count" className="text-sm whitespace-nowrap">
                Rows:
              </Label>
              <Input
                id="tv-expert-row-count"
                type="number"
                min={1}
                max={500}
                title="Rows to append when Add row is clicked (1–500)."
                className="w-16 h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                value={rowCountInput}
                onChange={(e) => setRowCountInput(e.target.value.replace(/\D/g, ""))}
                onBlur={handleRowCountBlur}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              title="Append as many empty rows as the number in the Rows field (1–500)."
            >
              <Plus className="mr-1 h-4 w-4" />
              Add row
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Campaign</span>{" "}
              <span className="tabular-nums">{campaignRangeLabel}</span>
              <span className="mx-1.5 text-border">·</span>
              <span>{weekColumns.length} week columns</span>
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/80 bg-card/30 shadow-sm">
            {normalizedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
                <div
                  className="rounded-full border border-border/60 p-3 text-muted-foreground/45"
                  style={{ backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.06) }}
                  aria-hidden
                >
                  <Grid3x3 className="h-8 w-8" strokeWidth={1.25} />
                </div>
                <div className="space-y-2 max-w-md">
                  <p className="text-sm font-medium text-foreground">
                    No expert schedule rows
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add a row to enter placements and weekly quantities, or
                    return to Standard mode to build line items first—switching
                    to Expert again will map them into this grid.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={addRow}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add first row
                </Button>
              </div>
            ) : (
              <div
                ref={gridScrollRef}
                className="relative min-h-[400px] max-h-[min(70vh,900px)] min-w-0 overflow-x-auto overflow-y-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]"
                onKeyDownCapture={handleGridKeyDownCapture}
                onPasteCapture={handlePasteCapture}
                onCopyCapture={handleCopyCapture}
                onCutCapture={handleCutCapture}
                data-expert-grid={domGridId}
                data-tv-expert-grid-scroll=""
              >
                <table className="w-max min-w-full border-collapse text-sm">
                  <thead className="[&_tr]:border-b-0">
                    <tr>
                      {descriptorHeadLabels.map((label, i) => (
                        <th
                          key={`h-${i}`}
                          className={stickyThCorner(
                            i === descriptorHeadLabels.length - 1
                              ? TV_EXPERT_WEEK_SCROLLER_EDGE
                              : undefined
                          )}
                          style={{
                            ...stickyStyleHeaderCorner(i),
                            ...tvExpertHeaderCellBgStyle,
                          }}
                        >
                          {label === "Unit Rate" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{label}</span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs">
                                Rate (CPC / CPM / CPV depending on Buy Type)
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            label
                          )}
                        </th>
                      ))}
                      {weekColumns.map((col) => (
                        <th
                          key={col.weekKey}
                          className={stickyThWeek}
                          style={{
                            ...tvExpertWeekColLayoutStyle,
                            ...tvExpertHeaderCellBgStyle,
                          }}
                          title={col.labelFull}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-h-[3rem] w-full cursor-default items-center justify-center px-0.5 py-1">
                                <span className="text-[11px] font-semibold uppercase leading-snug tracking-wider text-foreground tabular-nums">
                                  {col.labelShort}
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              className="max-w-xs text-xs"
                            >
                              {col.labelFull}
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedRows.map((row, rowIndex) => {
                      const gross = rowGrossCost(row, weekKeys)
                      const qtySum =
                        sumWeeklyQuantities(row.weeklyValues, weekKeys) +
                        sumMergedQuantities(row)
                      const stripe =
                        rowIndex % 2 === 1 ? "bg-muted/10" : ""
                      const stripeStyle =
                        rowIndex % 2 === 0
                          ? {
                              backgroundColor: rgbaFromHex(
                                MEDIA_ACCENT_HEX,
                                0.03
                              ),
                            }
                          : undefined
                      const grossCol = tvDescriptorKeys.length
                      const actionsCol = tvDescriptorKeys.length + 1
                      const sigmaCol = tvDescriptorKeys.length + 2
                      const cStart = colIndexOf("startDate")
                      const cEnd = colIndexOf("endDate")
                      const cMkt = colIndexOf("market")
                      const cNet = colIndexOf("network")
                      const cSta = colIndexOf("station")
                      const cDay = colIndexOf("daypart")
                      const cPlc = colIndexOf("placement")
                      const cBuy = colIndexOf("buyType")
                      const cDemo = colIndexOf("buyingDemo")
                      const cSize = colIndexOf("size")
                      const cTarps = colIndexOf("tarps")
                      const cRate = colIndexOf("unitRate")
                      const cFixed = colIndexOf("fixedCostMedia")
                      const cClient = colIndexOf("clientPaysForMedia")
                      const cBif = colIndexOf("budgetIncludesFees")

                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            stripe,
                            "transition-colors hover:bg-muted/35 focus-within:bg-muted/35"
                          )}
                          style={stripeStyle}
                        >
                          <td
                            className={stickyTd(cStart)}
                            style={stickyStyleBody(cStart)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cStart
                              )}
                              readOnly
                              tabIndex={-1}
                              title={row.startDate}
                              className="h-8 cursor-default border-0 bg-transparent px-0 text-[11px] tabular-nums text-muted-foreground shadow-none focus-visible:ring-0"
                              value={formatYmdDisplay(row.startDate)}
                            />
                          </td>
                          <td
                            className={stickyTd(cEnd)}
                            style={stickyStyleBody(cEnd)}
                          >
                            <Input
                              id={expertGridCellId(domGridId, rowIndex, cEnd)}
                              readOnly
                              tabIndex={-1}
                              title={row.endDate}
                              className="h-8 cursor-default border-0 bg-transparent px-0 text-[11px] tabular-nums text-muted-foreground shadow-none focus-visible:ring-0"
                              value={formatYmdDisplay(row.endDate)}
                            />
                          </td>
                          <td
                            className={stickyTd(cMkt)}
                            style={stickyStyleBody(cMkt)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cMkt
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.market}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "market")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cMkt, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, { market: e.target.value })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cNet)}
                            style={stickyStyleBody(cNet)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cNet
                              )}
                              options={networkComboboxOptions}
                              value={row.network}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { network: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search networks…"
                              emptyText={
                                networkNames.length === 0
                                  ? "No networks."
                                  : "No match."
                              }
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "network")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "network")
                                } else {
                                  tryFuzzyMatch(
                                    rowIndex,
                                    "network",
                                    row.network
                                  )
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cSta)}
                            style={stickyStyleBody(cSta)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cSta
                              )}
                              options={stationComboboxOptions}
                              value={row.station}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { station: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search stations…"
                              emptyText={
                                stationNames.length === 0
                                  ? "No stations."
                                  : "No match."
                              }
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "station")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "station")
                                } else {
                                  tryFuzzyMatch(
                                    rowIndex,
                                    "station",
                                    row.station
                                  )
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cDay)}
                            style={stickyStyleBody(cDay)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cDay
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.daypart}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "daypart")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cDay, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  daypart: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cPlc)}
                            style={stickyStyleBody(cPlc)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cPlc
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.placement}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "placement")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cPlc, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  placement: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cBuy)}
                            style={stickyStyleBody(cBuy)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cBuy
                              )}
                              options={TV_BUY_TYPE_OPTIONS}
                              value={row.buyType}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { buyType: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search buy types…"
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "buyType")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "buyType")
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cDemo)}
                            style={stickyStyleBody(cDemo)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cDemo
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.buyingDemo}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "buyingDemo")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cDemo, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  buyingDemo: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cSize)}
                            style={stickyStyleBody(cSize)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cSize
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.size}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "size")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cSize, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  size: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cTarps)}
                            style={stickyStyleBody(cTarps)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cTarps
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs tabular-nums shadow-none focus-visible:ring-1"
                              inputMode="decimal"
                              value={
                                row.tarps === "" || row.tarps === undefined
                                  ? ""
                                  : String(row.tarps)
                              }
                              onFocus={() =>
                                handleCellFocus(rowIndex, "tarps")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cTarps, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  tarps: e.target.value,
                                })
                              }
                            />
                          </td>
                              <td
                                className={stickyTd(cFixed)}
                                style={stickyStyleBody(cFixed)}
                              >
                                <div className="flex h-8 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cFixed
                                    )}
                                    className="h-4 w-4 rounded border"
                                    checked={row.fixedCostMedia}
                                    onChange={(e) =>
                                      updateRow(rowIndex, {
                                        fixedCostMedia: e.target.checked,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "fixedCostMedia"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cFixed,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cClient)}
                                style={stickyStyleBody(cClient)}
                              >
                                <div className="flex h-8 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cClient
                                    )}
                                    className="h-4 w-4 rounded border"
                                    checked={row.clientPaysForMedia}
                                    onChange={(e) =>
                                      updateRow(rowIndex, {
                                        clientPaysForMedia: e.target.checked,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "clientPaysForMedia"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cClient,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cBif)}
                                style={stickyStyleBody(cBif)}
                              >
                                <div className="flex h-8 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cBif
                                    )}
                                    className="h-4 w-4 rounded border"
                                    checked={row.budgetIncludesFees}
                                    onChange={(e) =>
                                      updateRow(rowIndex, {
                                        budgetIncludesFees: e.target.checked,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "budgetIncludesFees"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cBif,
                                        e
                                      )
                                    }
                                  />
                                </div>
                              </td>
                          <td
                            className={stickyTd(cRate)}
                            style={stickyStyleBody(cRate)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cRate
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              inputMode="decimal"
                              value={
                                row.unitRate === "" ||
                                row.unitRate === undefined
                                  ? ""
                                  : String(row.unitRate)
                              }
                              onFocus={() =>
                                handleCellFocus(rowIndex, "unitRate")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cRate, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  unitRate: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(grossCol)}
                            style={stickyStyleBody(grossCol)}
                          >
                            <div
                              className="flex h-8 items-center px-1 text-xs tabular-nums"
                              title={`Σ weekly qty × unit rate (${qtySum} × ${parseNum(row.unitRate)})`}
                            >
                              {formatMoney(gross, moneyOpts)}
                            </div>
                          </td>
                          <td
                            className={cn(stickyTd(actionsCol), "text-center")}
                            style={stickyStyleBody(actionsCol)}
                          >
                            <div className="flex justify-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => duplicateRow(rowIndex)}
                                aria-label="Duplicate row"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => deleteRow(rowIndex)}
                                disabled={normalizedRows.length <= 1}
                                aria-label="Delete row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td
                            className={cn(
                              stickyTd(sigmaCol),
                              "text-muted-foreground",
                              TV_EXPERT_WEEK_SCROLLER_EDGE
                            )}
                            style={stickyStyleBody(sigmaCol)}
                          >
                            <div
                              className="flex h-8 items-center justify-end px-1 text-xs tabular-nums"
                              title="Row subtotal: sum of weekly quantities"
                            >
                              {qtySum === 0
                                ? "—"
                                : qtySum.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                  })}
                            </div>
                          </td>
                          {(() => {
                            const renderedWeekCells: React.ReactNode[] = []
                            const rowMergeMap = rowMergeMaps[rowIndex]
                            for (let wi = 0; wi < weekColumns.length; wi += 1) {
                              const col = weekColumns[wi]!
                              const cell = row.weeklyValues[col.weekKey]
                              const interiorSpanId =
                                rowMergeMap?.interiorByWeekKey[col.weekKey]
                              if (interiorSpanId) {
                                // Interior weeks are owned by the anchor td via colSpan.
                                continue
                              }
                              const anchorSpanId =
                                rowMergeMap?.anchorByWeekKey[col.weekKey]
                              const mSpan = anchorSpanId
                                ? rowMergeMap?.spanById[anchorSpanId] ?? null
                                : null
                              const spanMeta = anchorSpanId
                                ? rowMergeMap?.spanMetaByAnchorWeekKey[col.weekKey]
                                : null
                              const spanKeys = spanMeta
                                ? [...spanMeta.weekKeysIncluded]
                                : [col.weekKey]
                              const spanLen = Math.max(1, spanMeta?.spanLength ?? 1)
                              const display = weeklyCellDisplayValue(cell, mSpan)
                              const colIndex =
                                tvDescriptorKeys.length +
                                WEEK_GRID_COL_OFFSET +
                                wi
                              const multiHighlight = spanKeys.some(
                                (key) =>
                                  weekMultiSelect?.rowIndex === rowIndex &&
                                  weekMultiSelect.keys.includes(key)
                              )
                              const weekQtyVisual = mSpan
                                ? Number.isFinite(mSpan.totalQty) && mSpan.totalQty !== 0
                                : (() => {
                                    const v = row.weeklyValues[col.weekKey]
                                    if (v === "" || v === undefined || v === null)
                                      return false
                                    return (
                                      Number.isFinite(parseNum(v)) && parseNum(v) !== 0
                                    )
                                  })()
                              const mergeReadyOnCell = spanKeys.some(
                                (key) =>
                                  mergeTarget !== null &&
                                  mergeTarget.rowIndex === rowIndex &&
                                  mergeTarget.keys.includes(key)
                              )
                              const stripOutlineRow =
                                !weekRectSelection &&
                                weekStripSelection !== null &&
                                weekStripSelection.rowIndex === rowIndex
                                  ? weekStripSelection.rowIndex
                                  : null
                              const rangeOutline = tvWeekRangeOutlineFlags(
                                rowIndex,
                                wi,
                                weekRectSelection,
                                stripOutlineRow,
                                weekKeys
                              )
                              const mergeReadyOutline = oohMergeReadyOutlineFlags(
                                rowIndex,
                                wi,
                                mergeTarget,
                                mergeWeeksReady,
                                weekKeys
                              )
                              const inRectPasteBand = Boolean(
                                weekRectSelection && rangeOutline.inRange
                              )
                              const inStripPasteBand = Boolean(
                                !weekRectSelection &&
                                  weekStripSelection &&
                                  rangeOutline.inRange
                              )
                              const inMergePulseHighlight = spanKeys.some(
                                (key) =>
                                  tvWeekCellInMergePulseHighlight(
                                    rowIndex,
                                    key,
                                    mergeSpanHighlightPulse,
                                    weekKeys
                                  )
                              )
                              const isMergedAnchorCell = Boolean(mSpan)
                              const showMergeContextTrigger =
                                mergeWeeksReady &&
                                mergeTarget !== null &&
                                mergeTarget.rowIndex === rowIndex &&
                                !isMergedAnchorCell &&
                                col.weekKey ===
                                  mergeTarget.keys[mergeTarget.keys.length - 1]!
                              const isActiveWeekCell =
                                focusedCell?.rowIndex === rowIndex &&
                                focusedCell.columnKey === col.weekKey
                              const isSingleDraggableCell =
                                !isMergedAnchorCell && weekQtyVisual
                              const isMergedDraggableCell = isMergedAnchorCell
                              const isDraggableWeekCell =
                                (isSingleDraggableCell || isMergedDraggableCell) &&
                                display.trim() !== ""
                              const isRangeOutlined = rangeOutline.inRange
                              const isDragDropTargetCell =
                                weekDragOver?.rowIndex === rowIndex &&
                                weekDragOver.weekKey === col.weekKey
                              const isDragDropTargetValid = Boolean(
                                isDragDropTargetCell && weekDragOver?.valid
                              )
                              const isSelectionHighlighted =
                                isRangeOutlined ||
                                inRectPasteBand ||
                                inStripPasteBand ||
                                multiHighlight ||
                                mergeReadyOnCell ||
                                inMergePulseHighlight
                              const isInMultiSelection = Boolean(
                                multiCellSelection &&
                                  rowIndex >= multiCellSelection.startRow &&
                                  rowIndex <= multiCellSelection.endRow &&
                                  wi >= multiCellSelection.startCol &&
                                  wi <= multiCellSelection.endCol
                              )
                              const isInCopiedSelection = Boolean(
                                copiedCells &&
                                  rowIndex >= copiedCells.selection.startRow &&
                                  rowIndex <= copiedCells.selection.endRow &&
                                  wi >= copiedCells.selection.startCol &&
                                  wi <= copiedCells.selection.endCol
                              )
                              const isEmptyWeekCell = !weekQtyVisual && !isMergedAnchorCell
                              const isPopulatedNonMergedCell =
                                weekQtyVisual &&
                                !isMergedAnchorCell &&
                                !isSelectionHighlighted
                              const isFocusVisible = isActiveWeekCell
                              const tdClassName = cn(
                                "border-b border-r p-0 align-middle",
                                // Base states (empty / populated non-merged / merged anchor via wrapper).
                                isEmptyWeekCell && "bg-background",
                                isPopulatedNonMergedCell &&
                                  TV_WEEK_CELL_VISUAL_CLASSES.populatedSingleTd,
                                // Selection overlays remain readable above base fills.
                                !isMergedAnchorCell &&
                                  inRectPasteBand &&
                                  "bg-primary/[0.14] dark:bg-primary/12",
                                !isMergedAnchorCell &&
                                  inStripPasteBand &&
                                  "bg-emerald-500/[0.13] dark:bg-emerald-500/[0.1]",
                                !isMergedAnchorCell &&
                                  inMergePulseHighlight &&
                                  "z-[5] bg-fuchsia-500/16 ring-2 ring-inset ring-fuchsia-600/55 dark:bg-fuchsia-500/12 dark:ring-fuchsia-400/50",
                                !isMergedAnchorCell &&
                                  multiHighlight &&
                                  !isRangeOutlined &&
                                  "bg-primary/10 ring-1 ring-inset ring-primary/40",
                                !isMergedAnchorCell &&
                                  isInMultiSelection &&
                                  "ring-2 ring-blue-500 ring-inset bg-blue-100/50 dark:bg-blue-900/30",
                                !isMergedAnchorCell &&
                                  isInCopiedSelection &&
                                  "ring-2 ring-dashed ring-green-500 animate-pulse",
                                !isMergedAnchorCell &&
                                  mergeReadyOnCell &&
                                  "tv-expert-week-cell--merge-ready z-[6] bg-amber-500/24 ring-2 ring-inset ring-amber-600/75 shadow-sm dark:bg-amber-500/20 dark:ring-amber-400/70",
                                isDragDropTargetValid &&
                                  "z-[6] ring-2 ring-inset ring-sky-500/55 bg-sky-500/10 dark:ring-sky-400/55 dark:bg-sky-500/10",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "z-[6] ring-1 ring-inset ring-destructive/55 bg-destructive/8",
                                isMergedAnchorCell && "bg-transparent overflow-hidden",
                                isDraggableWeekCell && "cursor-grab",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "cursor-not-allowed",
                                tvWeekOutlineEdgeClasses(rangeOutline),
                                !isMergedAnchorCell &&
                                  oohMergeReadyOutlineEdgeClasses(mergeReadyOutline),
                                // Focus wins visual priority.
                                isFocusVisible &&
                                  !isMergedAnchorCell &&
                                  !mergeReadyOnCell &&
                                  "z-[6] ring-2 ring-primary ring-offset-1 ring-offset-background shadow-md"
                              )
                              const mergedAnchorWrapperClassName = cn(
                                !isMergedAnchorCell &&
                                  "relative flex h-full min-h-8 w-full items-center",
                                isMergedAnchorCell &&
                                  TV_WEEK_CELL_VISUAL_CLASSES.mergedSurface,
                                isMergedAnchorCell && "cursor-pointer",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "cursor-not-allowed"
                              )
                              const inputClassName = cn(
                                "box-border w-full min-w-0 max-w-full rounded-none border-0 text-center text-[11px] tabular-nums shadow-none transition-colors duration-150",
                                isMergedAnchorCell
                                  ? TV_WEEK_CELL_VISUAL_CLASSES.mergedInput
                                  : "h-8 px-0.5 bg-transparent",
                                !isMergedAnchorCell && "focus-visible:ring-2 focus-visible:ring-offset-0",
                                mergeReadyOnCell
                                  ? "focus-visible:ring-amber-600/70 dark:focus-visible:ring-amber-400/70"
                                  : !isMergedAnchorCell &&
                                      "focus-visible:ring-primary/55",
                                isMergedAnchorCell &&
                                  "absolute inset-0 z-[1] max-h-none",
                                isFocusVisible &&
                                  !isMergedAnchorCell &&
                                  !mergeReadyOnCell &&
                                  "bg-background/50 dark:bg-background/35",
                                weekQtyVisual &&
                                  !isMergedAnchorCell &&
                                  "text-foreground font-medium",
                                weekQtyVisual &&
                                  isMergedAnchorCell &&
                                  "text-violet-950 dark:text-violet-100"
                              )
                              renderedWeekCells.push(
                                <td
                                  key={`${row.id}-${col.weekKey}`}
                                  colSpan={spanLen}
                                  style={
                                    isMergedAnchorCell
                                      ? {
                                          width: TV_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          minWidth:
                                            TV_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          maxWidth:
                                            TV_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          boxSizing: "border-box",
                                        }
                                      : tvExpertWeekColLayoutStyle
                                  }
                                  className={tdClassName}
                                  title={
                                    isMergedAnchorCell
                                      ? "Drag to move merged burst"
                                      : isSingleDraggableCell
                                        ? "Drag to move deliverable"
                                        : weekDragSource
                                          ? "Merged interior — drop on anchor or empty week"
                                          : undefined
                                  }
                                  onMouseEnter={(e) => {
                                    if (!isSelecting) return
                                    if ((e.buttons & 1) === 0) return
                                    const drag = weekAreaDragRef.current
                                    if (!drag) return
                                    if (isMergedAnchorCell) return
                                    const next = normalizeTelevisionWeekRect(
                                      drag.rowIndex,
                                      drag.weekKey,
                                      rowIndex,
                                      col.weekKey,
                                      weekKeys
                                    )
                                    lastDragRectDuringGestureRef.current = next
                                    setWeekRectSelection(next)
                                    setWeekMultiSelect(null)
                                    setWeekStripSelection(null)
                                    if (DEBUG_TV_MERGE) {
                                      console.debug("[TV merge] drag update", {
                                        rect: next,
                                      })
                                    }
                                  }}
                                  onDragOver={(e) => {
                                    if (!weekDragSource) return
                                    const verdict = validateWeekDropTarget(
                                      weekDragSource,
                                      rowIndex,
                                      col.weekKey
                                    )
                                    if (!verdict.ok) {
                                      setWeekDragOver({
                                        rowIndex,
                                        weekKey: col.weekKey,
                                        valid: false,
                                      })
                                      return
                                    }
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = "move"
                                    setWeekDragOver({
                                      rowIndex,
                                      weekKey: col.weekKey,
                                      valid: true,
                                    })
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault()
                                    const drag = weekDragSource
                                    if (!drag) return
                                    const verdict = validateWeekDropTarget(
                                      drag,
                                      rowIndex,
                                      col.weekKey
                                    )
                                    if (!verdict.ok) {
                                      clearWeekDragUiState()
                                      if (verdict.reason) {
                                        toast({
                                          variant: "destructive",
                                          title: "Invalid drop target",
                                          description: verdict.reason,
                                        })
                                      }
                                      return
                                    }

                                    const nextRows = normalizedRows.map((r) => ({
                                      ...r,
                                      weeklyValues: { ...r.weeklyValues },
                                      mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
                                    }))
                                    if (drag.type === "single") {
                                      if (
                                        drag.rowIndex === rowIndex &&
                                        drag.weekKey === col.weekKey
                                      ) {
                                        clearWeekDragUiState()
                                        return
                                      }
                                      const srcRow = nextRows[drag.rowIndex]
                                      const dstRow = nextRows[rowIndex]
                                      if (!srcRow || !dstRow) {
                                        clearWeekDragUiState()
                                        return
                                      }
                                      srcRow.weeklyValues[drag.weekKey] = ""
                                      dstRow.weeklyValues[col.weekKey] = drag.value
                                      pushRows(nextRows)
                                      clearWeekDragUiState()
                                      return
                                    }

                                    const targetStartIdx = weekKeys.indexOf(col.weekKey)
                                    if (targetStartIdx < 0) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    const targetEndIdx =
                                      targetStartIdx + drag.spanLength - 1
                                    if (targetEndIdx >= weekKeys.length) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    const newStartWeekKey = weekKeys[targetStartIdx]!
                                    const newEndWeekKey = weekKeys[targetEndIdx]!
                                    const sourceRow = nextRows[drag.rowIndex]
                                    const targetRow = nextRows[rowIndex]
                                    if (!sourceRow || !targetRow) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    sourceRow.mergedWeekSpans = (
                                      sourceRow.mergedWeekSpans ?? []
                                    ).filter((sp) => sp.id !== drag.spanId)
                                    for (const k of weekKeysInSpanInclusive(
                                      weekKeys,
                                      drag.startWeekKey,
                                      drag.endWeekKey
                                    )) {
                                      sourceRow.weeklyValues[k] = ""
                                    }
                                    for (const k of weekKeysInSpanInclusive(
                                      weekKeys,
                                      newStartWeekKey,
                                      newEndWeekKey
                                    )) {
                                      targetRow.weeklyValues[k] = ""
                                    }
                                    targetRow.mergedWeekSpans = [
                                      ...(targetRow.mergedWeekSpans ?? []),
                                      {
                                        id: drag.spanId,
                                        startWeekKey: newStartWeekKey,
                                        endWeekKey: newEndWeekKey,
                                        totalQty: drag.totalQty,
                                      },
                                    ]
                                    pushRows(nextRows)
                                    clearWeekDragUiState()
                                  }}
                                >
                                  <div
                                    className={mergedAnchorWrapperClassName}
                                    onMouseDown={(e) => {
                                      if (!isMergedAnchorCell) return
                                      if (e.button !== 0) return
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                    onClick={(e) => {
                                      if (!isMergedAnchorCell) return
                                      if (
                                        e.target instanceof HTMLElement &&
                                        e.target.closest("button")
                                      ) {
                                        return
                                      }
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                    onDoubleClick={(e) => {
                                      if (!isMergedAnchorCell) return
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                  >
                                    <Input
                                      ref={(el) => {
                                        const refKey = `${rowIndex}:${col.weekKey}`
                                        if (isMergedAnchorCell) {
                                          mergedAnchorInputRefs.current[refKey] = el
                                          return
                                        }
                                        delete mergedAnchorInputRefs.current[refKey]
                                      }}
                                      id={expertGridCellId(
                                        domGridId,
                                        rowIndex,
                                        colIndex
                                      )}
                                      className={cn(
                                        inputClassName,
                                        isMergedAnchorCell &&
                                          "bg-transparent shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                      )}
                                      inputMode="decimal"
                                      value={display}
                                      draggable={
                                        isMergedAnchorCell
                                          ? false
                                          : isDraggableWeekCell
                                      }
                                      onDragStart={(e) => {
                                        // Selection logic and drag-move are for non-merged cells only.
                                        if (isMergedAnchorCell) {
                                          e.preventDefault()
                                          return
                                        }
                                        const source = resolveWeekDragSource(
                                          rowIndex,
                                          col.weekKey
                                        )
                                        if (!source) {
                                          e.preventDefault()
                                          return
                                        }
                                        e.dataTransfer.effectAllowed = "move"
                                        e.dataTransfer.setData(
                                          "text/plain",
                                          `${source.rowIndex}:${source.weekKey}`
                                        )
                                        setWeekDragSource(source)
                                        setWeekDragOver(null)
                                      }}
                                      onDragEnd={() => {
                                        clearWeekDragUiState()
                                      }}
                                      onMouseDown={(e) => {
                                      if (isMergedAnchorCell) {
                                        // Merged anchors never start drag-select: edit surface only.
                                        e.stopPropagation()
                                        return
                                      }
                                      if (
                                        e.button !== 0 ||
                                        e.ctrlKey ||
                                        e.metaKey ||
                                        e.shiftKey
                                      ) {
                                        return
                                      }
                                      const currentRect = weekRectSelectionRef.current
                                      const currentMulti = weekMultiSelectRef.current
                                      if (
                                        weekPlainClickPreservesWeekAreaSelection(
                                          rowIndex,
                                          col.weekKey,
                                          currentRect,
                                          currentMulti,
                                          weekKeys
                                        )
                                      ) {
                                        return
                                      }
                                      weekAreaDragRef.current = {
                                        rowIndex,
                                        weekKey: col.weekKey,
                                      }
                                      setIsSelecting(true)
                                      if (DEBUG_TV_MERGE) {
                                        console.debug("[TV merge] drag start", {
                                          rowIndex,
                                          weekKey: col.weekKey,
                                        })
                                      }
                                      clearPendingMergeSelection(
                                        "brand new incompatible selection"
                                      )
                                    }}
                                      onClick={(e) => {
                                      if (isMergedAnchorCell) {
                                        focusMergedAnchorEditSurface(
                                          rowIndex,
                                          col.weekKey,
                                          e
                                        )
                                        return
                                      }
                                      const prevSel = weekMultiSelectRef.current
                                      if (
                                        prevSel &&
                                        prevSel.rowIndex !== rowIndex
                                      ) {
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(null)
                                      }
                                      const ctrl = e.ctrlKey || e.metaKey
                                      const shift = e.shiftKey

                                      if (ctrl || shift) {
                                        postDragWeekClickRectRef.current = null
                                      } else {
                                        const postDragRect =
                                          postDragWeekClickRectRef.current
                                        if (postDragRect) {
                                          postDragWeekClickRectRef.current = null
                                          if (
                                            tvWeekCellInRect(
                                              rowIndex,
                                              col.weekKey,
                                              postDragRect,
                                              weekKeys
                                            )
                                          ) {
                                            lastWeekAnchorRef.current = {
                                              rowIndex,
                                              weekKey: col.weekKey,
                                            }
                                            setWeekStripSelection(null)
                                            return
                                          }
                                        }
                                      }

                                      if (ctrl) {
                                        e.preventDefault()
                                        const pending = pendingMergeSelection
                                        if (
                                          pending &&
                                          pending.keys.length >= 2 &&
                                          pending.rowIndex !== rowIndex
                                        ) {
                                          clearPendingMergeSelection(
                                            "brand new incompatible selection"
                                          )
                                        }
                                        toggleWeekMultiSelect(
                                          rowIndex,
                                          col.weekKey
                                        )
                                        return
                                      }
                                      if (shift && lastWeekAnchorRef.current) {
                                        e.preventDefault()
                                        if (
                                          lastWeekAnchorRef.current.rowIndex ===
                                          rowIndex
                                        ) {
                                          // Same row — single-row range (existing behavior)
                                          rangeWeekMultiSelect(
                                            rowIndex,
                                            lastWeekAnchorRef.current.weekKey,
                                            col.weekKey
                                          )
                                        } else {
                                          // Cross-row — create a multi-row rectangle selection
                                          const rect = normalizeTelevisionWeekRect(
                                            lastWeekAnchorRef.current.rowIndex,
                                            lastWeekAnchorRef.current.weekKey,
                                            rowIndex,
                                            col.weekKey,
                                            weekKeys
                                          )
                                          setWeekRectSelection(rect)
                                          setWeekMultiSelect(null)
                                          setWeekStripSelection(null)
                                          clearPendingMergeSelection(
                                            "cross-row shift-click selection"
                                          )
                                        }
                                        return
                                      }
                                      lastWeekAnchorRef.current = {
                                        rowIndex,
                                        weekKey: col.weekKey,
                                      }
                                      if (!shift && !isMergedAnchorCell) {
                                        if (
                                          weekPlainClickPreservesWeekAreaSelection(
                                            rowIndex,
                                            col.weekKey,
                                            weekRectSelectionRef.current,
                                            weekMultiSelectRef.current,
                                            weekKeys
                                          )
                                        ) {
                                          setWeekStripSelection(null)
                                          return
                                        }
                                        clearPendingMergeSelection(
                                          "brand new incompatible selection"
                                        )
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(
                                          normalizeTelevisionWeekRect(
                                            rowIndex,
                                            col.weekKey,
                                            rowIndex,
                                            col.weekKey,
                                            weekKeys
                                          )
                                        )
                                      }
                                      setWeekStripSelection(null)
                                    }}
                                      onFocus={() => {
                                      if (isMergedAnchorCell) {
                                        clearWeekSelectionWhereMergedAnchorInvolved(
                                          rowIndex,
                                          col.weekKey
                                        )
                                      }
                                      if (
                                        weekStripSelection &&
                                        weekStripSelection.rowIndex !== rowIndex
                                      ) {
                                        setWeekStripSelection(null)
                                      }
                                      // Non-merged: week area selection is not cleared on focus alone.
                                      handleCellFocus(rowIndex, col.weekKey)
                                    }}
                                      onKeyDown={(e) => {
                                      // Delete/Backspace can clear qty, but must never unmerge.
                                      if (
                                        isMergedAnchorCell &&
                                        (e.key === "Delete" || e.key === "Backspace")
                                      ) {
                                        // Intentionally allow native input editing path.
                                      }
                                      if (
                                        (e.ctrlKey || e.metaKey) &&
                                        e.key.toLowerCase() === "a"
                                      ) {
                                        e.preventDefault()
                                        if (isMergedAnchorCell) {
                                          return
                                        }
                                        setWeekStripSelection({ rowIndex })
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(null)
                                        clearPendingMergeSelection(
                                          "brand new incompatible selection"
                                        )
                                        return
                                      }
                                      if (
                                        (e.ctrlKey || e.metaKey) &&
                                        e.key.toLowerCase() === "m"
                                      ) {
                                        e.preventDefault()
                                        if (mergeWeeksReady) {
                                          handleMergeSelectedWeeks()
                                        }
                                        return
                                      }
                                      if (e.key === "Escape") {
                                        // Escape is an explicit user reset for all transient selection state.
                                        resetTransientWeekUiState()
                                      }
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        colIndex,
                                        e
                                      )
                                    }}
                                      onChange={(e) =>
                                        updateWeeklyCell(
                                          rowIndex,
                                          col.weekKey,
                                          e.target.value
                                        )
                                      }
                                    />
                                    {mSpan ? (
                                      <button
                                        type="button"
                                        className="pointer-events-auto absolute right-1 top-1 z-[60] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-600/70 bg-red-100 text-red-800 shadow-md transition-colors hover:border-red-700 hover:bg-red-600 hover:text-white dark:border-red-400/70 dark:bg-red-500/28 dark:text-red-200 dark:hover:border-red-300 dark:hover:bg-red-500 dark:hover:text-white"
                                        aria-label="Unmerge weeks"
                                        title="Unmerge weeks"
                                        onMouseDown={(e) => {
                                          // Unmerge is X-only; never pass through to cell/input handlers.
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onPointerDown={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          unmergeWeekSpan(rowIndex, mSpan.id)
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                    {showMergeContextTrigger ? (
                                      <button
                                        type="button"
                                        className="pointer-events-auto absolute right-0 top-0 z-[70] flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background/95 shadow-md transition-colors hover:bg-muted"
                                        aria-label="Merge selected weeks into one burst"
                                        title="Merge selected weeks into one burst"
                                        onMouseDown={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleMergeSelectedWeeks()
                                        }}
                                      >
                                        <GitMerge className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              )
                              wi += spanLen - 1
                            }
                            return renderedWeekCells
                          })()}
                        </tr>
                      )
                    })}
                    <tr
                      className="border-t-2 border-solid font-medium"
                      style={mediaTypeTotalsRowStyle(MEDIA_ACCENT_HEX)}
                    >
                      <td
                        className={stickyTd(0)}
                        style={{
                          ...stickyStyleBodyDescriptorTotalLabel,
                          ...tvExpertTotalsRowBgStyle,
                        }}
                        colSpan={tvDescriptorKeys.length}
                      >
                        <div className="flex h-8 items-center px-1">
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: MEDIA_ACCENT_HEX }}
                          >
                            Weekly totals
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          stickyTd(tvDescriptorKeys.length),
                          "h-8 px-1 text-xs tabular-nums"
                        )}
                        style={{
                          ...stickyStyleBody(tvDescriptorKeys.length),
                          ...tvExpertTotalsRowBgStyle,
                        }}
                      >
                        <div className="flex h-full items-center">
                          {formatMoney(containerTotals.sumGross, moneyOpts)}
                        </div>
                      </td>
                      <td
                        className={cn(
                          stickyTd(tvDescriptorKeys.length + 1),
                          "h-8"
                        )}
                        style={{
                          ...stickyStyleBody(tvDescriptorKeys.length + 1),
                          ...tvExpertTotalsRowBgStyle,
                        }}
                      />
                      <td
                        className={cn(
                          stickyTd(tvDescriptorKeys.length + 2),
                          "h-8 px-1 text-xs tabular-nums text-muted-foreground",
                          TV_EXPERT_WEEK_SCROLLER_EDGE
                        )}
                        style={{
                          ...stickyStyleBody(tvDescriptorKeys.length + 2),
                          ...tvExpertTotalsRowBgStyle,
                        }}
                      >
                        <div className="flex h-full items-center justify-end">
                          {containerTotals.sumQty === 0
                            ? "—"
                            : containerTotals.sumQty.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                        </div>
                      </td>
                      {weekColumns.map((col) => (
                        <td
                          key={`t-${col.weekKey}`}
                          style={{
                            ...tvExpertWeekColLayoutStyle,
                            ...tvExpertTotalsRowBgStyle,
                          }}
                          className="h-8 border-b border-r px-0.5 text-center text-xs tabular-nums align-middle"
                        >
                          <div className="flex h-full items-center justify-center">
                            {containerTotals.perWeek[col.weekKey] === 0
                              ? "—"
                              : containerTotals.perWeek[col.weekKey].toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 }
                                )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {normalizedRows.length > 0 ? (
          <div
            className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 shadow-sm"
            style={{
              borderLeftWidth: 3,
              borderLeftColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.45),
            }}
          >
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">Total Deliverables</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {containerTotals.sumQty.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">Net media</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(containerTotals.sumGross, moneyOpts)}
                </span>
              </span>
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">
                  Fees ({feetelevision}% on net)
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(containerTotals.fee, moneyOpts)}
                </span>
              </span>
              <span
                className="inline-flex items-baseline gap-2 rounded-full border px-3 py-1 text-xs shadow-sm"
                style={{
                  borderColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.35),
                  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.08),
                }}
              >
                <span className="text-muted-foreground">Total w/ fees</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: MEDIA_ACCENT_HEX }}
                >
                  {formatMoney(containerTotals.totalWithFee, moneyOpts)}
                </span>
              </span>
            </div>
          </div>
          ) : null}
        </CardContent>
          </div>
        </div>
        {DEBUG_TV_MERGE ? (
          <div className="pointer-events-none absolute bottom-2 right-2 z-50 max-w-[360px] rounded-md border bg-background/95 p-2 text-[11px] leading-snug shadow-lg">
            <div className="mb-1 font-medium text-foreground">TV Merge Debug</div>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
{JSON.stringify(
  {
    focusedCell,
    weekRectSelection,
    weekMultiSelect,
    pendingMergeSelection,
    mergeWeeksReady,
    mergeTarget,
  },
  null,
  2
)}
            </pre>
          </div>
        ) : null}
      </Card>

      <AlertDialog
        open={!!pendingFuzzyMatch}
        onOpenChange={(open) => {
          if (!open) setPendingFuzzyMatch(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fuzzy match suggestion</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFuzzyMatch ? (
                <>
                  Did you mean &quot;{pendingFuzzyMatch.matched}&quot; instead of
                  &quot;{pendingFuzzyMatch.value}&quot;?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => handleFuzzyMatchConfirm(false)}
            >
              Use once
            </AlertDialogAction>
            <AlertDialogAction
              type="button"
              onClick={() => handleFuzzyMatchConfirm(true)}
            >
              Use &amp; always auto-match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TooltipProvider>
  )
}
