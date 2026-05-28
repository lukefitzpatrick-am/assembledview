import type {
  SpreadsheetMultiCellSelection,
  SpreadsheetPasteLayoutMode,
  SpreadsheetRectSelection,
  SpreadsheetRegistryEntry,
} from "@/lib/spreadsheet/types"

export function normalizeSpreadsheetRect(
  row0: number,
  col0: number,
  row1: number,
  col1: number
): SpreadsheetRectSelection {
  return {
    rowStart: Math.min(row0, row1),
    rowEnd: Math.max(row0, row1),
    colStart: Math.min(col0, col1),
    colEnd: Math.max(col0, col1),
  }
}

export function registryEntryInRect(
  entry: Pick<SpreadsheetRegistryEntry, "rowIndex" | "colIndex">,
  rect: SpreadsheetRectSelection | null
): boolean {
  if (!rect) return false
  return (
    entry.rowIndex >= rect.rowStart &&
    entry.rowIndex <= rect.rowEnd &&
    entry.colIndex >= rect.colStart &&
    entry.colIndex <= rect.colEnd
  )
}

export function rectToMultiCellSelection(
  rect: SpreadsheetRectSelection | null
): SpreadsheetMultiCellSelection | null {
  if (!rect) return null
  return {
    startRow: rect.rowStart,
    endRow: rect.rowEnd,
    startCol: rect.colStart,
    endCol: rect.colEnd,
  }
}

export function keysInRect(
  entries: readonly SpreadsheetRegistryEntry[],
  rect: SpreadsheetRectSelection | null,
  serialize: (entry: SpreadsheetRegistryEntry) => string
): string[] {
  if (!rect) return []
  const out: string[] = []
  for (const e of entries) {
    if (registryEntryInRect(e, rect)) out.push(serialize(e))
  }
  return out
}

export type SpreadsheetSelectionBounds = Readonly<{
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}>

export function coerceSelectionBounds(
  anchorRow: number,
  anchorCol: number,
  rectSelection: SpreadsheetRectSelection | null,
  stripSelection: { rowIndex: number } | null,
  multiSelect: { rowIndex: number; cols: number[] } | null,
  colCount: number
): SpreadsheetSelectionBounds | null {
  if (
    rectSelection &&
    anchorRow >= rectSelection.rowStart &&
    anchorRow <= rectSelection.rowEnd &&
    anchorCol >= rectSelection.colStart &&
    anchorCol <= rectSelection.colEnd
  ) {
    return {
      rowStart: rectSelection.rowStart,
      rowEnd: rectSelection.rowEnd,
      colStart: rectSelection.colStart,
      colEnd: rectSelection.colEnd,
    }
  }

  if (stripSelection && anchorRow === stripSelection.rowIndex && colCount > 0) {
    return {
      rowStart: stripSelection.rowIndex,
      rowEnd: stripSelection.rowIndex,
      colStart: 0,
      colEnd: colCount - 1,
    }
  }

  if (
    multiSelect &&
    multiSelect.rowIndex === anchorRow &&
    multiSelect.cols.length >= 2
  ) {
    const sorted = [...multiSelect.cols].sort((a, b) => a - b)
    return {
      rowStart: anchorRow,
      rowEnd: anchorRow,
      colStart: sorted[0]!,
      colEnd: sorted[sorted.length - 1]!,
    }
  }

  return null
}

export function enumeratePasteTargets(
  anchorRow: number,
  anchorCol: number,
  rectSelection: SpreadsheetRectSelection | null,
  stripSelection: { rowIndex: number } | null,
  multiSelect: { rowIndex: number; cols: number[] } | null,
  entries: readonly SpreadsheetRegistryEntry[],
  colCount: number,
  serialize: (entry: SpreadsheetRegistryEntry) => string
): {
  originRow: number
  originCol: number
  targets: { rowIndex: number; colIndex: number; key: string }[]
} | null {
  const region = coerceSelectionBounds(
    anchorRow,
    anchorCol,
    rectSelection,
    stripSelection,
    multiSelect,
    colCount
  )
  if (!region) return null

  const isSingleCell =
    region.rowStart === region.rowEnd && region.colStart === region.colEnd

  if (rectSelection && !isSingleCell) {
    const targets: { rowIndex: number; colIndex: number; key: string }[] = []
    for (const e of entries) {
      if (
        e.rowIndex >= region.rowStart &&
        e.rowIndex <= region.rowEnd &&
        e.colIndex >= region.colStart &&
        e.colIndex <= region.colEnd
      ) {
        targets.push({
          rowIndex: e.rowIndex,
          colIndex: e.colIndex,
          key: serialize(e),
        })
      }
    }
    return { originRow: region.rowStart, originCol: region.colStart, targets }
  }

  if (stripSelection && anchorRow === stripSelection.rowIndex) {
    const targets = entries
      .filter((e) => e.rowIndex === stripSelection.rowIndex)
      .map((e) => ({
        rowIndex: e.rowIndex,
        colIndex: e.colIndex,
        key: serialize(e),
      }))
    return {
      originRow: region.rowStart,
      originCol: region.colStart,
      targets,
    }
  }

  if (
    multiSelect &&
    multiSelect.rowIndex === anchorRow &&
    multiSelect.cols.length >= 2
  ) {
    const colSet = new Set(multiSelect.cols)
    const targets = entries
      .filter((e) => e.rowIndex === anchorRow && colSet.has(e.colIndex))
      .map((e) => ({
        rowIndex: e.rowIndex,
        colIndex: e.colIndex,
        key: serialize(e),
      }))
    return {
      originRow: region.rowStart,
      originCol: region.colStart,
      targets,
    }
  }

  return null
}

export function buildPasteTargetsAnchorOnly(
  matrix: string[][],
  anchorRow: number,
  anchorCol: number,
  rowCount: number,
  colCount: number,
  resolveEntry: (rowIndex: number, colIndex: number) => SpreadsheetRegistryEntry | null,
  serialize: (entry: SpreadsheetRegistryEntry) => string
): { rowIndex: number; colIndex: number; key: string; raw: string }[] {
  const nR = matrix.length
  if (nR === 0) return []
  const nC = Math.max(0, ...matrix.map((row) => row.length))
  const rowsLeft = Math.max(0, rowCount - anchorRow)
  const colsLeft = Math.max(0, colCount - anchorCol)
  const destH = Math.min(nR, rowsLeft)
  const destW = Math.min(nC, colsLeft)
  const out: { rowIndex: number; colIndex: number; key: string; raw: string }[] = []
  for (let dr = 0; dr < destH; dr++) {
    for (let dc = 0; dc < destW; dc++) {
      const e = resolveEntry(anchorRow + dr, anchorCol + dc)
      if (e)
        out.push({
          rowIndex: e.rowIndex,
          colIndex: e.colIndex,
          key: serialize(e),
          raw: matrix[dr]?.[dc] ?? "",
        })
    }
  }
  return out
}

export function mapClipboardMatrixToTargets(
  matrix: string[][],
  originRow: number,
  originCol: number,
  targets: readonly { rowIndex: number; colIndex: number }[]
): {
  assignments: { rowIndex: number; colIndex: number; raw: string }[]
  layout: SpreadsheetPasteLayoutMode
} {
  const nR = matrix.length
  if (nR === 0) return { assignments: [], layout: "direct" }
  const nC = Math.max(0, ...matrix.map((row) => row.length))
  if (nC === 0) return { assignments: [], layout: "direct" }
  if (targets.length === 0) return { assignments: [], layout: "direct" }

  let minDr = Infinity
  let maxDr = -Infinity
  let minDc = Infinity
  let maxDc = -Infinity
  for (const t of targets) {
    const dr = t.rowIndex - originRow
    const dc = t.colIndex - originCol
    minDr = Math.min(minDr, dr)
    maxDr = Math.max(maxDr, dr)
    minDc = Math.min(minDc, dc)
    maxDc = Math.max(maxDc, dc)
  }

  const selH = maxDr >= minDr ? maxDr - minDr + 1 : 0
  const selW = maxDc >= minDc ? maxDc - minDc + 1 : 0

  if (!Number.isFinite(minDr) || !Number.isFinite(minDc)) {
    return { assignments: [], layout: "direct" }
  }

  const useClip = nR > selH || nC > selW
  const useTile = !useClip && (nR < selH || nC < selW)
  const layout: SpreadsheetPasteLayoutMode = useTile ? "tile" : useClip ? "clip" : "direct"

  const out: { rowIndex: number; colIndex: number; raw: string }[] = []
  for (const t of targets) {
    const dr = t.rowIndex - originRow
    const dc = t.colIndex - originCol
    const relDr = dr - minDr
    const relDc = dc - minDc

    let raw: string
    if (useTile) {
      const pr = matrix[((relDr % nR) + nR) % nR] ?? []
      raw = pr[((relDc % nC) + nC) % nC] ?? ""
    } else {
      if (relDr >= nR || relDc >= nC || relDr < 0 || relDc < 0) continue
      raw = matrix[relDr]?.[relDc] ?? ""
    }
    out.push({ rowIndex: t.rowIndex, colIndex: t.colIndex, raw })
  }
  return { assignments: out, layout }
}

export function buildExportTsvFromRect(
  entries: readonly SpreadsheetRegistryEntry[],
  rect: SpreadsheetRectSelection,
  getExportText: (entry: SpreadsheetRegistryEntry) => string
): string | null {
  const lines: string[] = []
  for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
    const cells: string[] = []
    for (let c = rect.colStart; c <= rect.colEnd; c++) {
      const e = entries.find((x) => x.rowIndex === r && x.colIndex === c)
      cells.push(e ? getExportText(e) : "")
    }
    if (cells.length > 0) lines.push(cells.join("\t"))
  }
  return lines.length > 0 ? lines.join("\n") : null
}

export function buildExportTsvFromStrip(
  entries: readonly SpreadsheetRegistryEntry[],
  rowIndex: number,
  getExportText: (entry: SpreadsheetRegistryEntry) => string
): string | null {
  const rowEntries = entries
    .filter((e) => e.rowIndex === rowIndex)
    .sort((a, b) => a.colIndex - b.colIndex)
  if (rowEntries.length === 0) return null
  return rowEntries.map((e) => getExportText(e)).join("\t")
}

export function resolveExportSelection(
  rectSelection: SpreadsheetRectSelection | null,
  stripSelection: { rowIndex: number } | null,
  focusedRow: number | null,
  focusedCol: number | null
):
  | { kind: "rect"; rect: SpreadsheetRectSelection }
  | { kind: "strip"; rowIndex: number }
  | { kind: "focused"; rowIndex: number; colIndex: number }
  | null {
  if (rectSelection) return { kind: "rect", rect: rectSelection }
  if (stripSelection) return { kind: "strip", rowIndex: stripSelection.rowIndex }
  if (focusedRow !== null && focusedCol !== null) {
    return { kind: "focused", rowIndex: focusedRow, colIndex: focusedCol }
  }
  return null
}
