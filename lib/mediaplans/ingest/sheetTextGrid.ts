import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"

/** 1-based column index → A1 column letters. */
export function colLetters(col: number): string {
  if (!Number.isInteger(col) || col < 1) {
    throw new Error(`colLetters: expected 1-based column, got ${col}`)
  }
  let s = ""
  let x = col
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

export function cellAddress(row: number, col: number): string {
  return `${colLetters(col)}${row}`
}

export type SheetTextCell = {
  addr: string
  value: string
}

/** Detected header band: header_row and the three rows above it (JCD 16–19). */
export function headerBandRows(shape: DetectedSheetShape): number[] {
  const start = Math.max(1, shape.header_row - 3)
  const out: number[] = []
  for (let r = start; r <= shape.header_row; r++) out.push(r)
  return out
}

export function encodeRowCells(
  shape: DetectedSheetShape,
  row: number,
): SheetTextCell[] {
  const line = shape.matrix[row]
  if (!line) return []
  const cells: SheetTextCell[] = []
  for (let c = 1; c < line.length; c++) {
    const value = String(line[c] ?? "").trim()
    if (!value) continue
    cells.push({ addr: cellAddress(row, c), value })
  }
  return cells
}

/** Every non-empty cell as A1 + value. */
export function encodeSheetTextGrid(shape: DetectedSheetShape): SheetTextCell[] {
  const cells: SheetTextCell[] = []
  for (let r = 1; r < shape.matrix.length; r++) {
    cells.push(...encodeRowCells(shape, r))
  }
  return cells
}

export function formatTextGrid(cells: SheetTextCell[]): string {
  return cells.map((c) => `${c.addr}\t${c.value}`).join("\n")
}

export type SheetSectionChunk = {
  /** First grouping row that opened this section (or first data row). */
  section_row: number
  grouping_rows: number[]
  data_rows: number[]
  header_band: number[]
  cells: SheetTextCell[]
}

/**
 * Chunk by grouping-row section headers. Consecutive grouping rows with no
 * buy data between them collapse into one section opener.
 */
export function chunkSheetBySection(shape: DetectedSheetShape): SheetSectionChunk[] {
  const grouping = new Set(shape.grouping_rows)
  const header_band = headerBandRows(shape)
  const ordered = [
    ...new Set([...shape.grouping_rows, ...shape.data_rows].sort((a, b) => a - b)),
  ]
  const chunks: SheetSectionChunk[] = []
  let groupingBuf: number[] = []
  let dataBuf: number[] = []
  let sectionRow: number | null = null

  const flush = () => {
    if (dataBuf.length === 0) {
      groupingBuf = []
      sectionRow = null
      return
    }
    const gRows = groupingBuf
    const dRows = dataBuf
    const start = sectionRow ?? dRows[0]!
    const rowSet = new Set([...header_band, ...gRows, ...dRows])
    const cells: SheetTextCell[] = []
    for (const r of [...rowSet].sort((a, b) => a - b)) {
      cells.push(...encodeRowCells(shape, r))
    }
    chunks.push({
      section_row: start,
      grouping_rows: gRows,
      data_rows: dRows,
      header_band,
      cells,
    })
    groupingBuf = []
    dataBuf = []
    sectionRow = null
  }

  for (const r of ordered) {
    if (grouping.has(r)) {
      if (dataBuf.length > 0) flush()
      if (sectionRow == null) sectionRow = r
      groupingBuf.push(r)
      continue
    }
    if (shape.data_rows.includes(r)) {
      if (sectionRow == null) sectionRow = r
      dataBuf.push(r)
    }
  }
  flush()
  return chunks
}
