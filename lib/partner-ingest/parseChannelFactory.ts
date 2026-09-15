import ExcelJS from "exceljs"
import JSZip from "jszip"

import { COL } from "./columnNames"
import { extractPlanCode } from "./extractPlanCode"
import type { ParsedPartnerFile, PartnerDeliveryRow, PartnerRawLine } from "./types"

export { CHANNEL_FACTORY_EXPECTED_HEADER } from "./columnNames"

const HEADER_SCAN_ROWS = 20

function unwrapCell(v: unknown): unknown {
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

function cellDisplay(v: unknown): string {
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

function isoDateFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseReportDate(v: unknown): string | null {
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
  if (iso) return iso[1]
  return null
}

function parseNumber(v: unknown): number {
  const unwrapped = unwrapCell(v)
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) return unwrapped
  const text = cellDisplay(unwrapped).replace(/,/g, "").trim()
  if (!text) return 0
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}

function rowCells(row: ExcelJS.Row, width: number): unknown[] {
  const out: unknown[] = []
  for (let c = 1; c <= width; c++) {
    out.push(row.getCell(c).value)
  }
  return out
}

function joinTab(cells: unknown[]): string {
  const last = [...cells].reverse().findIndex((c) => cellDisplay(c) !== "")
  const used = last < 0 ? [] : cells.slice(0, cells.length - last)
  return used.map((c) => cellDisplay(c)).join("\t")
}

function isHeaderRow(cells: unknown[]): boolean {
  const labels = cells.map((c) => cellDisplay(c).trim().toLowerCase())
  return labels.includes("day") && lowerIncludesImpressions(labels)
}

function lowerIncludesImpressions(labels: string[]): boolean {
  return labels.includes("impressions")
}

function headerIndex(cells: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  cells.forEach((c, i) => {
    const name = cellDisplay(c).trim()
    if (name) map.set(name, i)
  })
  return map
}

function col(map: Map<string, number>, name: string, cells: unknown[]): unknown {
  const i = map.get(name)
  if (i == null) return null
  return cells[i]
}

function isTotalsRow(cells: unknown[]): boolean {
  const first = cellDisplay(cells[0] ?? "").trim().toLowerCase()
  return first.startsWith("total")
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

function parseMatrix(matrix: unknown[][]): ParsedPartnerFile {
  const rawLines: PartnerRawLine[] = matrix.map((cells, i) => ({
    fileRow: i + 1,
    rawLine: joinTab(cells),
  }))

  let headerRow = -1
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, matrix.length); i++) {
    if (isHeaderRow(matrix[i] ?? [])) {
      headerRow = i + 1
      break
    }
  }
  if (headerRow < 0) {
    return {
      headerRow: 0,
      preambleRowCount: 0,
      detectedHeader: "",
      rawLines,
      rows: [],
    }
  }

  const headerCells = matrix[headerRow - 1] ?? []
  const detectedHeader = headerCells
    .map((c) => cellDisplay(c).trim())
    .filter((c) => c !== "")
    .join("|")
  const cols = headerIndex(headerCells)
  const rows: PartnerDeliveryRow[] = []

  for (let i = headerRow; i < matrix.length; i++) {
    const cells = matrix[i] ?? []
    if (isTotalsRow(cells)) continue
    const reportDate = parseReportDate(col(cols, COL.day, cells))
    if (!reportDate) continue
    const partnerLineItemName =
      cellDisplay(col(cols, COL.mediaBuyName, cells)).trim() || null
    const impressions = parseNumber(col(cols, COL.impressions, cells))
    const clicks = parseNumber(col(cols, COL.clicks, cells))
    const videoViews = parseNumber(col(cols, COL.videoViews, cells))
    const rateQ25 = parseNumber(col(cols, COL.rateQ25, cells))
    const rateQ50 = parseNumber(col(cols, COL.rateQ50, cells))
    const rateQ75 = parseNumber(col(cols, COL.rateQ75, cells))
    const rateFullyPlayed = parseNumber(col(cols, COL.rateFullyPlayed, cells))
    rows.push({
      reportDate,
      partnerAdvertiserId:
        cellDisplay(col(cols, COL.advertiserId, cells)).trim() || null,
      partnerCampaignName:
        cellDisplay(col(cols, COL.campaignName, cells)).trim() || null,
      partnerLineItemName,
      avLineItemId: extractPlanCode(partnerLineItemName),
      impressions,
      clicks,
      videoViews,
      rateQ25,
      rateQ50,
      rateQ75,
      rateFullyPlayed,
      videoQ25: Math.round(rateQ25 * impressions),
      videoQ50: Math.round(rateQ50 * impressions),
      videoQ75: Math.round(rateQ75 * impressions),
      completedViews: Math.round(rateFullyPlayed * impressions),
    })
  }

  return {
    headerRow,
    preambleRowCount: headerRow - 1,
    detectedHeader,
    rawLines,
    rows,
  }
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

export function parsePartnerFileMatrix(matrix: unknown[][]): ParsedPartnerFile {
  return parseMatrix(matrix)
}

export async function parseChannelFactoryBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedPartnerFile> {
  const matrix = await readPartnerFileMatrix(buffer, filename)
  return parsePartnerFileMatrix(matrix)
}
