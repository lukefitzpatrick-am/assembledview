/**
 * Excel-style fill-down for ExpertGrid descriptor columns.
 * Writes always go through `column.normalizePaste` when present (combobox);
 * otherwise the source value is copied as-is (text verbatim, dates as stored).
 */

import {
  getRowString,
  type ExpertDescriptorColumn,
} from "@/lib/mediaplan/expertGridChannelConfig"
import {
  findMergedSpanForWeek,
  newExpertMergeSpanId,
  type ExpertGridMergeSpan,
  type ExpertGridRowWithWeekly,
} from "@/lib/mediaplan/expertGridShared"

export type ExpertFillColumn = Pick<
  ExpertDescriptorColumn,
  "key" | "kind" | "normalizePaste" | "readOnly"
>

export type ExpertFillRange =
  | { mode: "all-below" }
  | { mode: "drag"; rowCount: number }

export function applyExpertFillDown<TRow extends Record<string, unknown>>(args: {
  rows: readonly TRow[]
  sourceRowIndex: number
  column: ExpertFillColumn
  range: ExpertFillRange
  publisherNames?: string[]
}): TRow[] | null {
  const {
    rows,
    sourceRowIndex,
    column,
    range,
    publisherNames = [],
  } = args

  if (column.readOnly) return null
  if (sourceRowIndex < 0 || sourceRowIndex >= rows.length) return null

  const start = sourceRowIndex + 1
  let endExclusive: number
  if (range.mode === "all-below") {
    endExclusive = rows.length
  } else {
    if (range.rowCount <= 0) return null
    endExclusive = Math.min(rows.length, start + range.rowCount)
  }
  if (start >= endExclusive) return null

  const sourceRow = rows[sourceRowIndex] as Record<string, unknown>
  const sourceRaw = getRowString(sourceRow, column.key)

  let writeValue: unknown
  if (column.normalizePaste) {
    writeValue = column.normalizePaste(sourceRaw, { publisherNames })
  } else if (
    column.kind === "date-start" ||
    column.kind === "date-end" ||
    column.kind === "unit-rate" ||
    column.kind === "checkbox-billing"
  ) {
    writeValue = sourceRow[column.key]
  } else {
    // Text and other string fields: copy verbatim (no trim).
    writeValue = sourceRaw
  }

  const next = rows.slice() as TRow[]
  for (let i = start; i < endExclusive; i++) {
    next[i] = { ...next[i], [column.key]: writeValue } as TRow
  }
  return next
}

/**
 * Fill right from a merged-span anchor by whole span widths.
 * A partial remainder at the drag end gets no span and no value.
 * Existing dest spans in the fill range are dissolved (removed).
 */
export function applyExpertWeekSpanFill<R extends ExpertGridRowWithWeekly>(args: {
  rows: readonly R[]
  weekKeys: readonly string[]
  sourceRowIndex: number
  sourceStartWeekKey: string
  sourceEndWeekKey: string
  dragEndWeekKey: string
}): R[] | null {
  const {
    rows,
    weekKeys,
    sourceRowIndex,
    sourceStartWeekKey,
    sourceEndWeekKey,
    dragEndWeekKey,
  } = args
  const row = rows[sourceRowIndex]
  if (!row) return null
  const s0 = weekKeys.indexOf(sourceStartWeekKey)
  const s1 = weekKeys.indexOf(sourceEndWeekKey)
  const drag = weekKeys.indexOf(dragEndWeekKey)
  if (s0 < 0 || s1 < 0 || drag < 0) return null
  const startWi = Math.min(s0, s1)
  const endWi = Math.max(s0, s1)
  const width = endWi - startWi + 1
  if (width < 1 || drag <= endWi) return null

  const fillWi0 = endWi + 1
  const fillWi1 = drag
  const sourceSpan = findMergedSpanForWeek(row, sourceStartWeekKey, weekKeys)
  const qty =
    sourceSpan && sourceSpan.startWeekKey === sourceStartWeekKey
      ? sourceSpan.totalQty
      : 0

  const kept = (row.mergedWeekSpans ?? []).filter((sp) => {
    if (sourceSpan && sp.id === sourceSpan.id) return true
    const i0 = weekKeys.indexOf(sp.startWeekKey)
    const i1 = weekKeys.indexOf(sp.endWeekKey)
    if (i0 < 0 || i1 < 0) return true
    const lo = Math.min(i0, i1)
    const hi = Math.max(i0, i1)
    const overlaps = !(hi < fillWi0 || lo > fillWi1)
    return !overlaps
  })

  const weeklyValues = { ...row.weeklyValues }
  const created: ExpertGridMergeSpan[] = []
  let cursor = fillWi0
  while (cursor + width - 1 <= fillWi1) {
    const a = weekKeys[cursor]
    const b = weekKeys[cursor + width - 1]
    if (!a || !b) break
    for (let wi = cursor; wi < cursor + width; wi++) {
      const wk = weekKeys[wi]
      if (wk) weeklyValues[wk] = ""
    }
    created.push({
      id: newExpertMergeSpanId(),
      startWeekKey: a,
      endWeekKey: b,
      totalQty: qty,
    })
    cursor += width
  }

  const dissolved = kept.length !== (row.mergedWeekSpans ?? []).length
  if (created.length === 0 && !dissolved) return null

  const next = rows.slice() as R[]
  next[sourceRowIndex] = {
    ...row,
    weeklyValues,
    mergedWeekSpans: [...kept, ...created],
  } as R
  return next
}
