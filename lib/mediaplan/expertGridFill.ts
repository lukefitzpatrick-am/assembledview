/**
 * Excel-style fill-down for ExpertGrid descriptor columns.
 * Writes always go through `column.normalizePaste` when present (combobox);
 * otherwise the source value is copied as-is (text verbatim, dates as stored).
 */

import {
  getRowString,
  type ExpertDescriptorColumn,
} from "@/lib/mediaplan/expertGridChannelConfig"

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
