/**
 * Stage 1 — deterministic media-owner plan structure detector.
 * Faithful TS port of plan_detector_prototype.py (validated on 5 owner plans),
 * plus Paid/Bonus sheet selection and ARN text-month / week-number flight.
 */

import ExcelJS from "exceljs"
import type {
  DetectedColumn,
  DetectedFlightColumn,
  DetectedSheet,
  FlightGranularity,
} from "./types"

const META_LABELS =
  /^(client|campaign|demo|demographic|target|timing|agency|date|version|prepared|share option|booking)/i
const LINEITEM_HDRS =
  /(media description|station|network|format|buy type|length|days?|daypart|placement|entitlement|site number|qms format|latitude|spot|market|size|type|address|panel|village|suburb|dimensions|illumination|direction|share.?of.?time|asset|digital operation|rotation|transit)/i
const COST_HDRS =
  /(rate|value|cost|total|cpm|invest|media value|market value|budget|entitlement|impact|audience|reach|frequenc|spots|potential|install|production)/i
const ISO = /^\d{4}-\d{2}-\d{2}/
const MONTH_TOKEN =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i

const MONTH_NUM: Record<string, number> = {
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

/** AU day/month/year — first DMY match in a string (e.g. range start of "24/08/2026 - 30/08/2026"). */
function parseDmyDate(v: unknown): Date | null {
  if (typeof v !== "string") return null
  const m = v.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  if (m[3].length <= 2) year = 2000 + year
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d
}

function parseMonthToken(v: unknown): number | null {
  if (typeof v !== "string") return null
  const t = v.trim().replace(/\./g, "").toLowerCase()
  if (!MONTH_TOKEN.test(t)) return null
  return MONTH_NUM[t] ?? null
}

function parseYearToken(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 2000 && v <= 2100) {
    return Math.trunc(v)
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(20\d{2})$/)
    if (m) return Number(m[1])
  }
  return null
}

function parseDayToken(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 31) {
    return Math.trunc(v)
  }
  if (typeof v === "string" && /^\d{1,2}$/.test(v.trim())) {
    const n = Number(v.trim())
    if (n >= 1 && n <= 31) return n
  }
  return null
}

function isoDateUTC(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d.toISOString().slice(0, 10)
}

/** Score worksheet for primary data selection. Penalises QA / Bonus / MOVE tabs. */
export function scoreWorksheetForPrimary(ws: ExcelJS.Worksheet): number {
  let score = (ws.rowCount || 0) * Math.min(ws.columnCount || 0, 140)
  if (/double check|summary|audience|r\+f|move|bonus/i.test(ws.name)) {
    score *= 0.3
  }
  if (/paid/i.test(ws.name)) {
    score *= 1.25
  }
  return score
}

/**
 * Prefer a *Paid* sibling when present; otherwise highest score.
 * Bonus tabs are deprioritised via {@link scoreWorksheetForPrimary}.
 */
export function pickPrimaryWorksheet(
  worksheets: ExcelJS.Worksheet[]
): ExcelJS.Worksheet {
  if (worksheets.length === 0) {
    throw new Error("Workbook has no worksheets")
  }
  const paid = worksheets.filter((s) => /paid/i.test(s.name))
  const pool = paid.length > 0 ? paid : worksheets
  let best = pool[0]
  let bestScore = -1
  for (const s of pool) {
    const score = scoreWorksheetForPrimary(s)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

function detectTextMonthFlight(
  cell: (r: number, c: number) => string | number | Date | null,
  letter: (c: number) => string,
  maxR: number,
  maxC: number
): {
  dateRow: number
  columns: DetectedFlightColumn[]
  granularity: FlightGranularity
} | null {
  let monthRow: number | null = null
  let monthHits = 0
  for (let r = 1; r <= maxR; r++) {
    let hits = 0
    for (let c = 1; c <= maxC; c++) {
      if (parseMonthToken(cell(r, c)) != null) hits++
    }
    if (hits > monthHits) {
      monthHits = hits
      monthRow = r
    }
  }
  if (monthRow == null || monthHits < 4) return null

  const weekRow = monthRow + 1
  if (weekRow > maxR) return null
  let weekHits = 0
  for (let c = 1; c <= maxC; c++) {
    if (parseDayToken(cell(weekRow, c)) != null) weekHits++
  }
  if (weekHits < 4) return null

  const yearRow = monthRow - 1
  let lastYear: number | null = null
  const columns: DetectedFlightColumn[] = []
  for (let c = 1; c <= maxC; c++) {
    const month = parseMonthToken(cell(monthRow, c))
    const day = parseDayToken(cell(weekRow, c))
    if (month == null || day == null) continue
    if (yearRow >= 1) {
      const y = parseYearToken(cell(yearRow, c))
      if (y != null) lastYear = y
    }
    if (lastYear == null) continue
    const date = isoDateUTC(lastYear, month, day)
    if (!date) continue
    const monthLabel = String(cell(monthRow, c) ?? "").trim()
    columns.push({
      index: c,
      letter: letter(c),
      date,
      label: `${monthLabel} / ${day}`.trim(),
    })
  }
  if (columns.length < 4) return null
  return {
    dateRow: weekRow,
    columns,
    granularity: "textMonthWeekly",
  }
}

function detectRangeDateFlight(
  cell: (r: number, c: number) => string | number | Date | null,
  letter: (c: number) => string,
  maxR: number,
  maxC: number
): {
  dateRow: number
  columns: DetectedFlightColumn[]
  granularity: FlightGranularity
} | null {
  let dateRow: number | null = null
  let bestHits = 0
  for (let r = 1; r <= maxR; r++) {
    let hits = 0
    for (let c = 1; c <= maxC; c++) {
      const v = cell(r, c)
      if (typeof v === "string" && parseDmyDate(v) != null) hits++
    }
    if (hits > bestHits) {
      bestHits = hits
      dateRow = r
    }
  }
  if (dateRow == null || bestHits < 4) return null

  const columns: DetectedFlightColumn[] = []
  for (let c = 1; c <= maxC; c++) {
    const v = cell(dateRow, c)
    if (typeof v !== "string") continue
    const d = parseDmyDate(v)
    if (!d) continue
    columns.push({
      index: c,
      letter: letter(c),
      date: d.toISOString().slice(0, 10),
      label: v.replace(/\s+/g, " ").trim(),
    })
  }
  if (columns.length < 4) return null

  const deltas = columns
    .slice(1)
    .map((col, i) => {
      const a = parseDate(columns[i].date)
      const b = parseDate(col.date)
      if (!a || !b) return 0
      return (b.getTime() - a.getTime()) / 86400000
    })
    .filter((x) => x > 0)
    .sort((a, b) => a - b)
  const med = deltas[Math.floor(deltas.length / 2)] ?? 0
  const granularity: FlightGranularity =
    med <= 8 ? "weekly" : med <= 31 ? "fourWeekly" : "monthly"

  return { dateRow, columns, granularity }
}

function detectWorksheet(
  ws: ExcelJS.Worksheet,
  opts?: { isBonusSheet?: boolean }
): DetectedSheet {
  const maxR = Math.min(ws.rowCount || 1, 60)
  const maxC = Math.min(ws.columnCount || 1, 140)

  const cell = (r: number, c: number) => unwrapCellValue(ws.getCell(r, c).value)
  const letter = (c: number) => ws.getColumn(c).letter

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

  let granularity: FlightGranularity = "unknown"
  let flightCols: DetectedFlightColumn[] = dates
    .filter((d) => !junk.has(d.c))
    .map((d) => ({
      index: d.c,
      letter: letter(d.c),
      date: toISO(d.date) ?? d.date.toISOString().slice(0, 10),
    }))

  if (flightCols.length >= 2) {
    const deltas = flightCols
      .slice(1)
      .map((d, i) => {
        const a = parseDate(flightCols[i].date)
        const b = parseDate(d.date)
        if (!a || !b) return 0
        return (b.getTime() - a.getTime()) / 86400000
      })
      .filter((x) => x > 0)
      .sort((a, b) => a - b)
    const med = deltas[Math.floor(deltas.length / 2)] ?? 0
    granularity = med <= 8 ? "weekly" : med <= 31 ? "fourWeekly" : "monthly"
  } else {
    const rangeFlight = detectRangeDateFlight(cell, letter, maxR, maxC)
    if (rangeFlight) {
      dateRow = rangeFlight.dateRow
      flightCols = rangeFlight.columns.filter((c) => !junk.has(c.index))
      granularity = rangeFlight.granularity
    } else {
      const textFlight = detectTextMonthFlight(cell, letter, maxR, maxC)
      if (textFlight) {
        dateRow = textFlight.dateRow
        flightCols = textFlight.columns.filter((c) => !junk.has(c.index))
        granularity = textFlight.granularity
      }
    }
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
    junkColumns: [...junk].map(letter).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    dataRowRange: { firstDataRow, lastDataRow },
    grid,
    ...(opts?.isBonusSheet ? { isBonusSheet: true as const } : {}),
  }
}

export async function detectPlanStructure(buffer: Buffer): Promise<DetectedSheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  if (wb.worksheets.length === 0) {
    throw new Error("Workbook has no worksheets")
  }

  const primaryWs = pickPrimaryWorksheet(wb.worksheets)
  const primary = detectWorksheet(primaryWs)

  const bonusSheets: DetectedSheet[] = []
  for (const s of wb.worksheets) {
    if (s === primaryWs) continue
    if (!/bonus/i.test(s.name)) continue
    bonusSheets.push(detectWorksheet(s, { isBonusSheet: true }))
  }
  if (bonusSheets.length) {
    primary.bonusSheets = bonusSheets
  }

  return primary
}
