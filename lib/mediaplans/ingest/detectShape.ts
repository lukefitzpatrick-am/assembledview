/**
 * Sheet shape detection for publisher schedules (MR-1).
 * No publisher names, row numbers, or column letters as constants.
 */

import ExcelJS from "exceljs"

export type CellScalar = string | number | boolean | null

export type DetectedGridColumn = {
  col: number
  header: string
  start_date: string | null
  end_date: string | null
  confidence: number
}

export type DetectedDescriptorColumn = {
  col: number
  header: string
}

export type DetectedSheetShape = {
  sheet_name: string
  header_row: number
  header_confidence: number
  descriptor_columns: DetectedDescriptorColumn[]
  descriptor_confidence: number
  grid_columns: DetectedGridColumn[]
  grid_confidence: number
  grouping_rows: number[]
  data_rows: number[]
  /** 1-based row/col → display string (trimmed). */
  matrix: string[][]
  /** Optional file-stated media total scraped from label+number adjacency. */
  file_stated_total: number | null
  line_item_sheet_confidence: number
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

function unwrapCell(v: unknown): CellScalar {
  if (v == null) return null
  if (typeof v === "object" && v && "result" in (v as object)) {
    return unwrapCell((v as { result?: unknown }).result ?? null)
  }
  if (typeof v === "object" && v && "richText" in (v as object)) {
    const parts = (v as { richText: { text?: string }[] }).richText
    return parts.map((p) => p.text ?? "").join("")
  }
  if (typeof v === "object" && v && "text" in (v as object)) {
    return String((v as { text: unknown }).text ?? "")
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === "number" || typeof v === "boolean") return v
  if (typeof v === "string") return v
  return String(v)
}

function cellText(v: CellScalar): string {
  if (v == null) return ""
  return String(v).replace(/\s+/g, " ").trim()
}

function isoUTC(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null
  }
  return dt.toISOString().slice(0, 10)
}

function parseExplicitDate(raw: string): { start: string; end: string } | null {
  const t = raw.trim()
  if (!t) return null
  // ISO
  const iso = t.match(/^(20\d{2})-(\d{2})-(\d{2})/)
  if (iso) {
    const s = `${iso[1]}-${iso[2]}-${iso[3]}`
    return { start: s, end: s }
  }
  // DMY range: 24/08/2026 - 30/08/2026
  const range = t.match(
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*[-–—to]+\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i,
  )
  if (range) {
    const y1 = range[3].length <= 2 ? 2000 + Number(range[3]) : Number(range[3])
    const y2 = range[6].length <= 2 ? 2000 + Number(range[6]) : Number(range[6])
    const a = isoUTC(y1, Number(range[2]), Number(range[1]))
    const b = isoUTC(y2, Number(range[5]), Number(range[4]))
    if (a && b) return { start: a, end: b }
  }
  const dmy = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (dmy) {
    const y = dmy[3].length <= 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    const s = isoUTC(y, Number(dmy[2]), Number(dmy[1]))
    if (s) return { start: s, end: s }
  }
  return null
}

function isMonthToken(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\./g, "")
  // AUG/SEP lunar-style labels
  const first = t.split("/")[0] ?? t
  return MONTH_NAMES[first] ?? null
}

function isWeekNumber(raw: string): boolean {
  const t = raw.trim()
  if (!/^\d{1,2}$/.test(t)) return false
  const n = Number(t)
  return n >= 1 && n <= 53
}

function isTemporalHeader(raw: string): boolean {
  if (!raw) return false
  if (parseExplicitDate(raw)) return true
  if (isMonthToken(raw) != null) return true
  if (isWeekNumber(raw) && Number(raw) >= 1) return true
  if (/^lunar\s*\d+/i.test(raw)) return true
  return false
}

function shortText(raw: string): boolean {
  return raw.length > 0 && raw.length <= 48
}

function buildMatrix(ws: ExcelJS.Worksheet): string[][] {
  const maxR = Math.max(ws.rowCount || 0, 1)
  const maxC = Math.min(Math.max(ws.columnCount || 0, 1), 200)
  const matrix: string[][] = Array.from({ length: maxR + 1 }, () =>
    Array.from({ length: maxC + 1 }, () => ""),
  )
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= maxC; c++) {
      matrix[r]![c] = cellText(unwrapCell(row.getCell(c).value))
    }
  }
  return matrix
}

function scoreHeaderRow(matrix: string[][], row: number): number {
  const cols = matrix[row] ?? []
  let run = 0
  let bestRun = 0
  for (let c = 1; c < cols.length; c++) {
    const t = cols[c] ?? ""
    if (shortText(t) && !/^\d+(\.\d+)?$/.test(t)) {
      run++
      bestRun = Math.max(bestRun, run)
    } else {
      run = 0
    }
  }
  if (bestRun < 3) return 0
  // Require >= 3 later rows with any population in those short-text columns
  const headerCols: number[] = []
  run = 0
  for (let c = 1; c < cols.length; c++) {
    const t = cols[c] ?? ""
    if (shortText(t) && !/^\d+(\.\d+)?$/.test(t)) {
      run++
      if (run >= 1) headerCols.push(c)
    } else {
      run = 0
    }
  }
  let populatedFollowers = 0
  for (let r = row + 1; r < Math.min(row + 40, matrix.length); r++) {
    let hit = false
    for (const c of headerCols.slice(0, 20)) {
      if ((matrix[r]?.[c] ?? "").trim()) {
        hit = true
        break
      }
    }
    if (hit) populatedFollowers++
  }
  if (populatedFollowers < 3) return 0
  return bestRun * 10 + populatedFollowers
}

function resolveGridColumn(
  matrix: string[][],
  headerRow: number,
  col: number,
): DetectedGridColumn {
  const header = matrix[headerRow]?.[col] ?? ""
  const explicit = parseExplicitDate(header)
  if (explicit) {
    return {
      col,
      header,
      start_date: explicit.start,
      end_date: explicit.end,
      confidence: 0.95,
    }
  }

  // Week-commencing under month: header row may be month-start ISO; next row day number
  const below = matrix[headerRow + 1]?.[col] ?? ""
  const monthFromHeader = isMonthToken(header)
  const day = /^\d{1,2}$/.test(below) ? Number(below) : null
  if (monthFromHeader != null && day != null && day >= 1 && day <= 31) {
    // year from nearby ISO or default from any ISO in header row
    let year = 2026
    for (let c = 1; c < (matrix[headerRow]?.length ?? 0); c++) {
      const iso = parseExplicitDate(matrix[headerRow]?.[c] ?? "")
      if (iso) {
        year = Number(iso.start.slice(0, 4))
        break
      }
    }
    // If header itself is ISO month start (SCA), use that year/month and day from below
    const isoHeader = parseExplicitDate(header)
    if (isoHeader) {
      const y = Number(isoHeader.start.slice(0, 4))
      const m = Number(isoHeader.start.slice(5, 7))
      const start = isoUTC(y, m, day)
      if (start) {
        const endDt = new Date(Date.UTC(y, m - 1, day + 6))
        return {
          col,
          header: `${header} / ${below}`,
          start_date: start,
          end_date: endDt.toISOString().slice(0, 10),
          confidence: 0.9,
        }
      }
    }
  }

  // ISO week number with lunar/month rows above
  if (isWeekNumber(header)) {
    const week = Number(header)
    const above1 = matrix[headerRow - 1]?.[col] ?? ""
    const above2 = matrix[headerRow - 2]?.[col] ?? ""
    // Prefer explicit date if sibling columns have ranges on same row as a date header elsewhere
    return {
      col,
      header,
      start_date: null,
      end_date: null,
      confidence:
        above1 || above2 || week >= 1 ? 0.55 : 0.35,
    }
  }

  if (isMonthToken(header) != null || /^lunar/i.test(header)) {
    return {
      col,
      header,
      start_date: null,
      end_date: null,
      confidence: 0.5,
    }
  }

  return {
    col,
    header,
    start_date: null,
    end_date: null,
    confidence: 0.2,
  }
}

function scrapeFileStatedTotal(matrix: string[][]): number | null {
  const labelRe =
    /media investment|media value|total investment|campaign total|nett|net media/i
  for (let r = 1; r < matrix.length; r++) {
    for (let c = 1; c < (matrix[r]?.length ?? 0); c++) {
      const label = matrix[r]?.[c] ?? ""
      if (!labelRe.test(label)) continue
      for (let k = c + 1; k <= Math.min(c + 8, (matrix[r]?.length ?? 0) - 1); k++) {
        const raw = (matrix[r]?.[k] ?? "").replace(/[$,\s]/g, "")
        if (/^\d+(\.\d+)?$/.test(raw)) {
          const n = Number(raw)
          if (n > 100) return n
        }
      }
      // sometimes value is below
      for (let rr = r + 1; rr <= Math.min(r + 2, matrix.length - 1); rr++) {
        const raw = (matrix[rr]?.[c] ?? "").replace(/[$,\s]/g, "")
        if (/^\d+(\.\d+)?$/.test(raw)) {
          const n = Number(raw)
          if (n > 100) return n
        }
      }
    }
  }
  return null
}

/**
 * Detect structure of one worksheet. Never mutates the workbook.
 */
export function detectSheetShape(ws: ExcelJS.Worksheet): DetectedSheetShape {
  const matrix = buildMatrix(ws)
  let bestRow = 1
  let bestScore = 0
  for (let r = 1; r < Math.min(matrix.length, 40); r++) {
    const s = scoreHeaderRow(matrix, r)
    if (s > bestScore) {
      bestScore = s
      bestRow = r
    }
  }

  const header_confidence = bestScore > 0 ? Math.min(1, bestScore / 80) : 0.1
  const headerCells = matrix[bestRow] ?? []
  const maxC = headerCells.length - 1

  let firstTemporal = -1
  for (let c = 1; c <= maxC; c++) {
    const h = headerCells[c] ?? ""
    const below = matrix[bestRow + 1]?.[c] ?? ""
    if (
      isTemporalHeader(h) ||
      (parseExplicitDate(h) == null &&
        /^\d{1,2}$/.test(below) &&
        (parseExplicitDate(h) != null || isMonthToken(h) != null || /^\d{4}-\d{2}-\d{2}/.test(h)))
    ) {
      // SCA: header is ISO date (month start) — treat as temporal
      if (parseExplicitDate(h) || isTemporalHeader(h)) {
        firstTemporal = c
        break
      }
    }
    if (parseExplicitDate(h)) {
      firstTemporal = c
      break
    }
  }
  // Broader: first col whose header parses as date OR (ISO-like / week / month)
  if (firstTemporal < 0) {
    for (let c = 1; c <= maxC; c++) {
      const h = headerCells[c] ?? ""
      if (parseExplicitDate(h) || isWeekNumber(h) || isMonthToken(h) != null) {
        firstTemporal = c
        break
      }
    }
  }

  const descriptor_columns: DetectedDescriptorColumn[] = []
  const endDesc = firstTemporal > 0 ? firstTemporal - 1 : maxC
  for (let c = 1; c <= endDesc; c++) {
    const header = headerCells[c] ?? ""
    if (!header) continue
    // Skip pure rate/money headers from descriptor block start? keep them — unmapped later
    descriptor_columns.push({ col: c, header })
  }

  const grid_columns: DetectedGridColumn[] = []
  if (firstTemporal > 0) {
    for (let c = firstTemporal; c <= maxC; c++) {
      const h = headerCells[c] ?? ""
      if (!h && !(matrix[bestRow + 1]?.[c] ?? "")) continue
      // Skip trailing summary labels without temporal nature when confidence low
      const g = resolveGridColumn(matrix, bestRow, c)
      if (!h && g.confidence < 0.5) continue
      // Include columns that look temporal OR have numeric week under month pattern
      if (
        parseExplicitDate(h) ||
        isWeekNumber(h) ||
        isMonthToken(h) != null ||
        parseExplicitDate(h) != null ||
        (/^\d{4}-\d{2}-\d{2}/.test(h) && /^\d{1,2}$/.test(matrix[bestRow + 1]?.[c] ?? ""))
      ) {
        // SCA two-row: resolve with day beneath
        if (/^\d{4}-\d{2}-\d{2}/.test(h) && /^\d{1,2}$/.test(matrix[bestRow + 1]?.[c] ?? "")) {
          const y = Number(h.slice(0, 4))
          const m = Number(h.slice(5, 7))
          const day = Number(matrix[bestRow + 1]![c])
          const start = isoUTC(y, m, day)
          if (start) {
            const end = new Date(Date.UTC(y, m - 1, day + 6))
              .toISOString()
              .slice(0, 10)
            grid_columns.push({
              col: c,
              header: `${h} / ${day}`,
              start_date: start,
              end_date: end,
              confidence: 0.92,
            })
            continue
          }
        }
        grid_columns.push(g)
      } else if (g.start_date) {
        grid_columns.push(g)
      }
    }
  }

  // If JCD-style: date ranges on header row but first temporal was found — already handled.
  // Also pull date-range columns that appear after rate columns on same header row.
  if (grid_columns.length === 0) {
    for (let c = 1; c <= maxC; c++) {
      const h = headerCells[c] ?? ""
      if (parseExplicitDate(h)) {
        grid_columns.push(resolveGridColumn(matrix, bestRow, c))
      }
    }
    if (grid_columns.length && descriptor_columns.length === 0) {
      const firstGrid = grid_columns[0]!.col
      for (let c = 1; c < firstGrid; c++) {
        const header = headerCells[c] ?? ""
        if (header) descriptor_columns.push({ col: c, header })
      }
    }
  }

  const descCols = descriptor_columns.map((d) => d.col)
  const gridCols = grid_columns.map((g) => g.col)

  const grouping_rows: number[] = []
  const data_rows: number[] = []
  for (let r = bestRow + 1; r < matrix.length; r++) {
    let descPop = 0
    let gridPop = 0
    const descVals: string[] = []
    for (const c of descCols) {
      const t = matrix[r]?.[c] ?? ""
      if (t) {
        descPop++
        descVals.push(t)
      }
    }
    for (const c of gridCols) {
      if (matrix[r]?.[c]) gridPop++
    }
    if (descPop === 0 && gridPop === 0) continue
    // Grouping: one (or few identical) descriptor cells, nothing in grid
    const identical =
      descVals.length > 0 && descVals.every((v) => v === descVals[0])
    if (gridPop === 0 && (descPop === 1 || (descPop <= 3 && identical))) {
      grouping_rows.push(r)
      continue
    }
    if (descPop >= 2 || gridPop > 0) {
      data_rows.push(r)
    }
  }

  const grid_confidence =
    grid_columns.length === 0
      ? 0
      : Math.min(
          1,
          grid_columns.reduce((a, g) => a + g.confidence, 0) /
            grid_columns.length,
        )

  const descriptor_confidence =
    descriptor_columns.length >= 3 ? 0.9 : descriptor_columns.length > 0 ? 0.6 : 0.2

  const line_item_sheet_confidence =
    grid_columns.length >= 3 && descriptor_columns.length >= 2 && data_rows.length >= 1
      ? Math.min(1, 0.55 + grid_confidence * 0.35 + descriptor_confidence * 0.1)
      : Math.min(0.35, grid_confidence)

  return {
    sheet_name: ws.name,
    header_row: bestRow,
    header_confidence,
    descriptor_columns,
    descriptor_confidence,
    grid_columns,
    grid_confidence,
    grouping_rows,
    data_rows,
    matrix,
    file_stated_total: scrapeFileStatedTotal(matrix),
    line_item_sheet_confidence,
  }
}

export async function detectWorkbookShapes(
  buffer: Buffer,
): Promise<DetectedSheetShape[]> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS reads .xlsx and .xlsm via xlsx reader (macros ignored; sheet data preserved).
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  return wb.worksheets.map((ws) => detectSheetShape(ws))
}

export async function detectWorkbookShapesFromFile(
  filePath: string,
): Promise<DetectedSheetShape[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return wb.worksheets.map((ws) => detectSheetShape(ws))
}
