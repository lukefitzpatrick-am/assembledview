import ExcelJS from "exceljs"
import JSZip from "jszip"

import type { PartnerRawLine } from "../types"

export const HEADER_SCAN_ROWS = 20

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function unwrapCell(v: unknown): unknown {
  if (v == null) return null
  if (typeof v === "object" && v && "result" in (v as object)) {
    return unwrapCell((v as { result?: unknown }).result ?? null)
  }
  if (typeof v === "object" && v && "richText" in (v as object)) {
    const parts = (v as { richText: { text?: string }[] }).richText
    return parts.map((p) => p.text ?? "").join("")
  }
  if (typeof v === "object" && v && "text" in (v as object)) {
    return (v as { text: unknown }).text
  }
  if (typeof v === "object" && v && "hyperlink" in (v as object) && "text" in (v as object)) {
    return (v as { text: unknown }).text
  }
  return v
}

export function cellDisplay(v: unknown): string {
  const unwrapped = unwrapCell(v)
  if (unwrapped == null) return ""
  if (unwrapped instanceof Date && !Number.isNaN(unwrapped.getTime())) {
    return isoDateFromDate(unwrapped)
  }
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
    return String(unwrapped)
  }
  return String(unwrapped).replace(/\r?\n/g, " ").trim()
}

export function isoDateFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Date cell, Excel serial, `YYYY-MM-DD` or Vistar's `d-MMM-yy`. */
export function parseReportDate(v: unknown): string | null {
  const unwrapped = unwrapCell(v)
  if (unwrapped instanceof Date && !Number.isNaN(unwrapped.getTime())) {
    return isoDateFromDate(unwrapped)
  }
  if (typeof unwrapped === "number" && unwrapped > 20000 && unwrapped < 80000) {
    // Excel serial date (days since 1899-12-30), UTC.
    const epoch = Date.UTC(1899, 11, 30)
    const dt = new Date(epoch + Math.round(unwrapped) * 86400000)
    return dt.toISOString().slice(0, 10)
  }
  const text = cellDisplay(unwrapped).trim()
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]!
  const dMonY = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/)
  if (dMonY) {
    const month = MONTHS[dMonY[2]!.toLowerCase()]
    if (month) {
      const yy = dMonY[3]!
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
      return `${year}-${String(month).padStart(2, "0")}-${dMonY[1]!.padStart(2, "0")}`
    }
  }
  return null
}

export function parseNumber(v: unknown): number {
  const unwrapped = unwrapCell(v)
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) return unwrapped
  const text = cellDisplay(unwrapped).replace(/,/g, "").trim()
  if (!text) return 0
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}

export function headerIndex(cells: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  cells.forEach((c, i) => {
    const name = cellDisplay(c).trim()
    if (name) map.set(name, i)
  })
  return map
}

export function col(map: Map<string, number>, name: string, cells: unknown[]): unknown {
  const i = map.get(name)
  if (i == null) return null
  return cells[i]
}

export function joinTab(cells: unknown[]): string {
  const last = [...cells].reverse().findIndex((c) => cellDisplay(c) !== "")
  const used = last < 0 ? [] : cells.slice(0, cells.length - last)
  return used.map((c) => cellDisplay(c)).join("\t")
}

/** Header labels the row must carry, lowercased. 1-based row number, or -1. */
export function findHeaderRow(matrix: unknown[][], labels: string[]): number {
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, matrix.length); i++) {
    const cells = (matrix[i] ?? []).map((c) => cellDisplay(c).trim().toLowerCase())
    if (labels.every((label) => cells.includes(label))) return i + 1
  }
  return -1
}

export function detectedHeaderFrom(cells: unknown[], separator: string): string {
  return cells
    .map((c) => cellDisplay(c).trim())
    .filter((c) => c !== "")
    .join(separator)
}

function rowCells(row: ExcelJS.Row, width: number): unknown[] {
  const out: unknown[] = []
  for (let c = 1; c <= width; c++) {
    out.push(row.getCell(c).value)
  }
  return out
}

async function matrixFromXlsx(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const width = Math.max(ws.columnCount || 0, 11)
  const rows: unknown[][] = []
  const last = ws.rowCount || 0
  for (let r = 1; r <= last; r++) {
    rows.push(rowCells(ws.getRow(r), width))
  }
  return rows
}

function matrixFromCsv(text: string): unknown[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  return lines.map((line) => splitCsvLine(line))
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

async function matrixFromBuffer(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buffer)
    const inner = Object.keys(zip.files).find(
      (n) =>
        !n.startsWith("__MACOSX") &&
        !zip.files[n]?.dir &&
        /\.(xlsx|csv)$/i.test(n)
    )
    if (!inner) throw new Error("zip has no .xlsx or .csv attachment")
    const nested = await zip.files[inner]!.async("nodebuffer")
    return matrixFromBuffer(Buffer.from(nested), inner)
  }
  if (lower.endsWith(".csv")) {
    return matrixFromCsv(buffer.toString("utf8"))
  }
  return matrixFromXlsx(buffer)
}

export async function readPartnerFileMatrix(
  buffer: Buffer,
  filename: string
): Promise<unknown[][]> {
  return matrixFromBuffer(buffer, filename)
}

export function rawLinesFromMatrix(matrix: unknown[][]): PartnerRawLine[] {
  return matrix.map((cells, i) => ({
    fileRow: i + 1,
    rawLine: joinTab(cells),
  }))
}
