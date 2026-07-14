/**
 * Stage 1 — deterministic media-owner plan structure detector.
 * Faithful TS port of plan_detector_prototype.py (validated on 5 owner plans).
 */

import ExcelJS from "exceljs"
import type { DetectedColumn, DetectedSheet } from "./types"

const META_LABELS =
  /^(client|campaign|demo|demographic|target|timing|agency|date|version|prepared|share option|booking)/i
const LINEITEM_HDRS =
  /(media description|station|network|format|buy type|length|days?|daypart|placement|entitlement|site number|qms format|latitude|spot|market|size|type|address)/i
const COST_HDRS =
  /(rate|value|cost|total|cpm|invest|media value|market value|budget|entitlement|impact|audience|reach|frequenc|spots|potential|install|production)/i
const ISO = /^\d{4}-\d{2}-\d{2}/

function unwrapCellValue(v: unknown): string | number | Date | null {
  if (v == null) return null
  if (typeof v === "object" && v && "result" in (v as object)) {
    return unwrapCellValue((v as { result?: unknown }).result ?? null)
  }
  if (typeof v === "object" && v && "text" in (v as object) && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text
  }
  if (v instanceof Date) return v
  if (typeof v === "number" || typeof v === "string") return v
  if (typeof v === "boolean") return v ? 1 : 0
  return String(v)
}

function toISO(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === "string" && ISO.test(v.trim())) return v.trim().slice(0, 10)
  return null
}

function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  if (typeof v === "string" && ISO.test(v.trim())) {
    const d = new Date(v.trim().slice(0, 10))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export async function detectPlanStructure(buffer: Buffer): Promise<DetectedSheet> {
  const wb = new ExcelJS.Workbook()
  // exceljs accepts Buffer / ArrayBuffer / Uint8Array
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  if (wb.worksheets.length === 0) {
    throw new Error("Workbook has no worksheets")
  }

  let ws = wb.worksheets[0]
  let best = -1
  for (const s of wb.worksheets) {
    let score = (s.rowCount || 0) * Math.min(s.columnCount || 0, 140)
    if (/double check|summary|audience|r\+f|move/i.test(s.name)) score *= 0.3
    if (score > best) {
      best = score
      ws = s
    }
  }

  const maxR = Math.min(ws.rowCount || 1, 60)
  const maxC = Math.min(ws.columnCount || 1, 140)

  const cell = (r: number, c: number) => unwrapCellValue(ws.getCell(r, c).value)

  const dateCells: Record<number, { c: number; date: Date }[]> = {}
  const junk = new Set<number>()

  for (let r = 1; r <= maxR; r++) {
    for (let c = 1; c <= maxC; c++) {
      const v = cell(r, c)
      const d = parseDate(v)
      if (d) {
        ;(dateCells[r] ??= []).push({ c, date: d })
        if (d.getFullYear() < 2000) junk.add(c)
      }
      if (typeof v === "string" && v.trim().toLowerCase() === "error") junk.add(c)
    }
  }

  let dateRow: number | null = null
  let dates: { c: number; date: Date }[] = []
  for (const [r, cells] of Object.entries(dateCells)) {
    const valid = cells
      .filter((x) => x.date.getFullYear() >= 2000)
      .sort((a, b) => a.c - b.c)
    if (valid.length > dates.length) {
      dateRow = Number(r)
      dates = valid
    }
  }

  let granularity: DetectedSheet["flight"]["granularity"] = "unknown"
  if (dates.length >= 2) {
    const deltas = dates
      .slice(1)
      .map((d, i) => (d.date.getTime() - dates[i].date.getTime()) / 86400000)
      .filter((x) => x > 0)
      .sort((a, b) => a - b)
    const med = deltas[Math.floor(deltas.length / 2)] ?? 0
    granularity = med <= 8 ? "weekly" : med <= 31 ? "fourWeekly" : "monthly"
  }

  let headerRow: number | null = null
  let hScore = 0
  for (let r = 1; r <= maxR; r++) {
    let toks = 0
    for (let c = 1; c <= maxC; c++) {
      const v = cell(r, c)
      if (typeof v === "string" && LINEITEM_HDRS.test(v)) toks++
    }
    if (toks > hScore) {
      hScore = toks
      headerRow = r
    }
  }

  const meta: Record<string, string> = {}
  const top = headerRow ?? dateRow ?? 10
  for (let r = 1; r < top; r++) {
    for (let c = 1; c <= Math.min(maxC, 8); c++) {
      const v = cell(r, c)
      if (typeof v === "string" && META_LABELS.test(v)) {
        for (let cc = c + 1; cc <= Math.min(maxC, c + 6); cc++) {
          const nv = cell(r, cc)
          if (nv != null) {
            const key = v.trim().replace(/:$/, "").toLowerCase()
            meta[key] =
              nv instanceof Date
                ? (toISO(nv) ?? String(nv))
                : String(nv)
            break
          }
        }
      }
    }
  }

  const letter = (c: number) => ws.getColumn(c).letter
  const flightCols = dates.map((d) => ({
    index: d.c,
    letter: letter(d.c),
    date: toISO(d.date) ?? d.date.toISOString().slice(0, 10),
  }))
  const firstFlight = flightCols.length
    ? Math.min(...flightCols.map((f) => f.index))
    : maxC

  const costColumns: DetectedColumn[] = []
  const lineItemColumns: DetectedColumn[] = []
  if (headerRow) {
    for (let c = 1; c <= maxC; c++) {
      const v = cell(headerRow, c)
      if (typeof v !== "string" || !v.trim()) continue
      const col: DetectedColumn = {
        index: c,
        letter: letter(c),
        header: v.replace(/\s+/g, " ").trim(),
      }
      if (junk.has(c) || flightCols.some((f) => f.index === c)) continue
      // Match prototype: cost headers anywhere outside flight/junk; descriptors left of flight.
      if (COST_HDRS.test(v)) costColumns.push(col)
      else if (c < firstFlight) lineItemColumns.push(col)
    }
  }

  const firstDataRow = (headerRow ?? 1) + 1
  const lastDataRow = ws.rowCount || firstDataRow
  const grid: (string | number | null)[][] = []
  const gridStart = headerRow ?? 1
  const gridEnd = Math.min(lastDataRow, gridStart + 400)
  for (let r = gridStart; r <= gridEnd; r++) {
    const row: (string | number | null)[] = []
    for (let c = 1; c <= maxC; c++) {
      if (junk.has(c)) continue
      const v = cell(r, c)
      if (v instanceof Date) row.push(toISO(v))
      else if (typeof v === "string" || typeof v === "number") row.push(v)
      else row.push(v == null ? null : String(v))
    }
    grid.push(row)
  }

  return {
    sheetName: ws.name,
    meta,
    headerRow,
    lineItemColumns,
    flight: { dateRow, columns: flightCols, granularity },
    costColumns,
    junkColumns: [...junk].map(letter),
    dataRowRange: { firstDataRow, lastDataRow },
    grid,
  }
}
