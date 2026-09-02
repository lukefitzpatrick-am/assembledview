import "server-only"

import ExcelJS from "exceljs"
import type {
  RmBlock,
  RmDataRow,
  RmMetric,
  RmSheet,
  RmWorkbookParse,
} from "./royMorganTypes"

const MAX_SHEETS = 25
const MAX_ROWS = 5000
const MAX_BLOCKS = 40
const MAX_DATA_ROWS = 3000
const EMPTY_LABEL_STREAK = 15
const WAVE_RE = /^[A-Z]{3}\d{2}[A-Z]\d_[A-Z0-9]+$/
const METRICS = new Set<RmMetric>(["wc", "v%", "ix"])

type PendingBlock = {
  firstMetricCol: number
  metrics: RmMetric[]
  metricCols: Partial<Record<RmMetric, number>>
}

function apostrophe(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC\u0060]/g, "'")
}

function cellRaw(cell: ExcelJS.Cell): unknown {
  const withResult = cell as ExcelJS.Cell & { result?: unknown }
  if (withResult.result !== undefined && withResult.result !== null) {
    return withResult.result
  }
  return cell.value
}

function unwrap(value: unknown): unknown {
  if (value == null) return null
  if (typeof value !== "object") return value
  const o = value as Record<string, unknown>
  if (Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[])
      .map((p) => String(p?.text ?? ""))
      .join("")
  }
  if (typeof o.text === "string") return o.text
  if ("formula" in o || "sharedFormula" in o) {
    return o.result ?? null
  }
  if (o.error) return null
  return value
}

function cellText(cell: ExcelJS.Cell): string {
  const v = unwrap(cellRaw(cell))
  if (v == null) return ""
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = unwrap(cellRaw(cell))
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "")
    if (!t || isSuppressedToken(t)) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isSuppressedToken(raw: string): boolean {
  const t = raw.trim()
  if (t === "-" || t === "--") return true
  return t.toLowerCase() === "n/a"
}

function metricToken(text: string): RmMetric | null {
  const t = text.trim().toLowerCase()
  return METRICS.has(t as RmMetric) ? (t as RmMetric) : null
}

function isUnweightedLabel(text: string): boolean {
  return /^\(unweighted\)$/i.test(apostrophe(text).trim())
}

function isPopnLabel(text: string): boolean {
  return /^\(popn\s*'\s*000\)$/i.test(apostrophe(text).trim())
}

function afterColon(text: string, prefix: string): string | null {
  const t = text.trim()
  if (!t.toLowerCase().startsWith(prefix.toLowerCase())) return null
  const idx = t.indexOf(":")
  if (idx < 0) return null
  return t.slice(idx + 1).trim()
}

function sheetCell(ws: ExcelJS.Worksheet, row: number, col: number): ExcelJS.Cell {
  return ws.getRow(row).getCell(col)
}

function rowLastCol(ws: ExcelJS.Worksheet, row: number): number {
  const r = ws.getRow(row)
  return Math.max(r.cellCount || 0, ws.columnCount || 0, 1)
}

function detectBlocksOnHeaderRow(ws: ExcelJS.Worksheet, row: number): PendingBlock[] {
  const last = rowLastCol(ws, row)
  const tokens: Array<RmMetric | null> = []
  for (let c = 1; c <= last; c++) {
    tokens[c] = metricToken(cellText(sheetCell(ws, row, c)))
  }
  const out: PendingBlock[] = []
  let c = 1
  while (c <= last) {
    const tok = tokens[c]
    const prev = tokens[c - 1] ?? null
    const starts =
      tok === "wc" || (tok === "v%" && prev !== "wc")
    if (!starts || !tok) {
      c += 1
      continue
    }
    const metrics: RmMetric[] = [tok]
    const metricCols: Partial<Record<RmMetric, number>> = { [tok]: c }
    let j = c + 1
    while (j <= last) {
      const next = tokens[j]
      if (next === "v%" || next === "ix") {
        if (!metricCols[next]) {
          metrics.push(next)
          metricCols[next] = j
        }
        j += 1
        continue
      }
      break
    }
    out.push({ firstMetricCol: c, metrics, metricCols })
    c = j
  }
  return out
}

function findLabelCol(ws: ExcelJS.Worksheet, headerRow: number, firstMetricCol: number): number {
  let bestCol: number | null = null
  let bestDist = Infinity
  const from = Math.max(1, headerRow - 6)
  for (let r = headerRow - 1; r >= from; r--) {
    for (let c = firstMetricCol; c >= 1; c--) {
      const t = cellText(sheetCell(ws, r, c))
      if (isUnweightedLabel(t) || isPopnLabel(t)) {
        const dist = firstMetricCol - c
        if (dist < bestDist) {
          bestDist = dist
          bestCol = c
        }
      }
    }
  }
  return bestCol ?? Math.max(1, firstMetricCol - 1)
}

function findColumnName(ws: ExcelJS.Worksheet, headerRow: number, firstMetricCol: number): string {
  const from = Math.max(1, headerRow - 8)
  for (let r = headerRow - 1; r >= from; r--) {
    const t = cellText(sheetCell(ws, r, firstMetricCol))
    if (!t) continue
    if (metricToken(t)) continue
    if (isUnweightedLabel(t) || isPopnLabel(t)) continue
    if (cellNumber(sheetCell(ws, r, firstMetricCol)) != null && !/[a-z]/i.test(t)) continue
    return t
  }
  return `Column ${firstMetricCol}`
}

function findStat(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  labelCol: number,
  firstMetricCol: number,
  kind: "unweighted" | "popn"
): number | null {
  const from = Math.max(1, headerRow - 6)
  for (let r = headerRow - 1; r >= from; r--) {
    const t = cellText(sheetCell(ws, r, labelCol))
    const hit = kind === "unweighted" ? isUnweightedLabel(t) : isPopnLabel(t)
    if (hit) return cellNumber(sheetCell(ws, r, firstMetricCol))
  }
  return null
}

function scanProvenance(ws: ExcelJS.Worksheet, maxRow: number): {
  waveCode: string | null
  surveyPeriod: string | null
  filter: string | null
  weights: string | null
} {
  let waveCode: string | null = null
  let surveyPeriod: string | null = null
  let filter: string | null = null
  let weights: string | null = null
  const lastColScan = Math.max(ws.columnCount || 0, 20)
  for (let r = 1; r <= maxRow; r++) {
    const last = Math.max(rowLastCol(ws, r), lastColScan)
    for (let c = 1; c <= last; c++) {
      const t = cellText(sheetCell(ws, r, c))
      if (!t) continue
      if (!surveyPeriod) {
        const v = afterColon(t, "Survey Period:")
        if (v != null) surveyPeriod = v
      }
      if (!filter) {
        const v = afterColon(t, "Filter:")
        if (v != null) filter = v
      }
      if (!weights) {
        const v = afterColon(t, "Weights:")
        if (v != null) weights = v
      }
      if (!waveCode && WAVE_RE.test(t)) waveCode = t
    }
  }
  return { waveCode, surveyPeriod, filter, weights }
}

function isEmptyMetrics(
  ws: ExcelJS.Worksheet,
  row: number,
  pending: PendingBlock
): boolean {
  return pending.metrics.every((m) => {
    const col = pending.metricCols[m]
    if (!col) return true
    return cellText(sheetCell(ws, row, col)) === ""
  })
}

function metricSuppressed(ws: ExcelJS.Worksheet, row: number, col: number | undefined): boolean {
  if (!col) return false
  return isSuppressedToken(cellText(sheetCell(ws, row, col)))
}

function shouldStop(label: string, waveCode: string | null): boolean {
  if (!label) return false
  if (label.startsWith("Some population estimates")) return true
  if (label.startsWith("Roy Morgan Research")) return true
  if (waveCode && label === waveCode) return true
  if (WAVE_RE.test(label)) return true
  return false
}

function normaliseReachPcts(
  rows: RmDataRow[],
  warnings: string[],
  blockId: string
): void {
  const raw: number[] = []
  for (const row of rows) {
    if (row.suppressed) continue
    if (row.reachPct != null) raw.push(row.reachPct)
  }
  if (raw.length === 0) return
  const max = Math.max(...raw)
  const asPercent = max > 1
  for (const row of rows) {
    if (row.reachPct == null) continue
    let v = asPercent ? row.reachPct / 100 : row.reachPct
    if (v < 0 || v > 1) {
      warnings.push(
        `${blockId} row ${row.rowIndex}: v% ${row.reachPct} clamped to [0,1]`
      )
      v = Math.min(1, Math.max(0, v))
    }
    row.reachPct = v
  }
}

function parseSheet(
  ws: ExcelJS.Worksheet,
  warnings: string[],
  blockBudget: { remaining: number }
): RmSheet {
  const maxRow = Math.min(ws.rowCount || 0, MAX_ROWS)
  if ((ws.rowCount || 0) > MAX_ROWS) {
    warnings.push(`${ws.name}: stopped at ${MAX_ROWS} rows`)
  }
  const provenance = scanProvenance(ws, maxRow)
  const headerRows: number[] = []
  for (let r = 1; r <= maxRow; r++) {
    const last = rowLastCol(ws, r)
    for (let c = 1; c <= last; c++) {
      if (metricToken(cellText(sheetCell(ws, r, c)))) {
        headerRows.push(r)
        break
      }
    }
  }

  const skipped: RmSheet["skipped"] = []
  const blocks: RmBlock[] = []

  for (const headerRow of headerRows) {
    const pending = detectBlocksOnHeaderRow(ws, headerRow)
    if (pending.length === 0) continue

    type Acc = {
      pending: PendingBlock
      labelCol: number
      columnName: string
      unweightedN: number | null
      popn000: number | null
      rows: RmDataRow[]
      section: string | null
      emptyStreak: number
      stopped: boolean
    }

    const accs: Acc[] = pending.map((p) => ({
      pending: p,
      labelCol: findLabelCol(ws, headerRow, p.firstMetricCol),
      columnName: findColumnName(ws, headerRow, p.firstMetricCol),
      unweightedN: null as number | null,
      popn000: null as number | null,
      rows: [] as RmDataRow[],
      section: null as string | null,
      emptyStreak: 0,
      stopped: false,
    }))

    for (const acc of accs) {
      acc.unweightedN = findStat(
        ws,
        headerRow,
        acc.labelCol,
        acc.pending.firstMetricCol,
        "unweighted"
      )
      acc.popn000 = findStat(
        ws,
        headerRow,
        acc.labelCol,
        acc.pending.firstMetricCol,
        "popn"
      )
    }

    for (let r = headerRow + 1; r <= maxRow; r++) {
      if (accs.every((a) => a.stopped)) break
      const labels = accs.map((a) => cellText(sheetCell(ws, r, a.labelCol)))
      const allMetricsEmpty = accs.every((a) => isEmptyMetrics(ws, r, a.pending))
      const anyLabel = labels.some((l) => l.length > 0)

      if (anyLabel && allMetricsEmpty) {
        const sectionLabel = labels.find((l) => l.length > 0) ?? ""
        if (shouldStop(sectionLabel, provenance.waveCode)) {
          for (const a of accs) a.stopped = true
          break
        }
        for (const a of accs) {
          if (a.stopped) continue
          a.section = sectionLabel
          a.emptyStreak = 0
        }
        continue
      }

      for (let i = 0; i < accs.length; i++) {
        const acc = accs[i]!
        if (acc.stopped) continue
        const label = labels[i] ?? ""
        if (shouldStop(label, provenance.waveCode)) {
          acc.stopped = true
          continue
        }
        if (!label) {
          acc.emptyStreak += 1
          if (acc.emptyStreak >= EMPTY_LABEL_STREAK) acc.stopped = true
          continue
        }
        acc.emptyStreak = 0

        const wcCol = acc.pending.metricCols.wc
        const vCol = acc.pending.metricCols["v%"]
        const ixCol = acc.pending.metricCols.ix
        const suppressed =
          metricSuppressed(ws, r, wcCol) || metricSuppressed(ws, r, vCol)
        const hasAnyMetric =
          (wcCol != null && cellText(sheetCell(ws, r, wcCol)) !== "") ||
          (vCol != null && cellText(sheetCell(ws, r, vCol)) !== "") ||
          (ixCol != null && cellText(sheetCell(ws, r, ixCol)) !== "")
        if (!hasAnyMetric) continue
        if (acc.rows.length >= MAX_DATA_ROWS) {
          warnings.push(
            `${ws.name}:${acc.pending.firstMetricCol} stopped at ${MAX_DATA_ROWS} data rows`
          )
          acc.stopped = true
          continue
        }
        const wc = suppressed ? null : wcCol ? cellNumber(sheetCell(ws, r, wcCol)) : null
        const reachPct = suppressed ? null : vCol ? cellNumber(sheetCell(ws, r, vCol)) : null
        const index = suppressed
          ? null
          : ixCol
            ? cellNumber(sheetCell(ws, r, ixCol))
            : null
        acc.rows.push({
          section: acc.section,
          label,
          rowIndex: r,
          wc,
          reachPct,
          index,
          suppressed,
        })
      }
    }

    for (const acc of accs) {
      if (blockBudget.remaining <= 0) {
        warnings.push("stopped at 40 blocks per workbook")
        break
      }
      blockBudget.remaining -= 1
      const nonSuppressed = acc.rows.filter((row) => !row.suppressed).length
      const hasVpct = acc.pending.metrics.includes("v%") && acc.rows.some((row) => row.reachPct != null)
      if (nonSuppressed < 3 || (acc.popn000 == null && !hasVpct)) {
        skipped.push({
          reason:
            nonSuppressed < 3
              ? "fewer than 3 non-suppressed data rows"
              : "no popn000 and no v% values",
          atRow: headerRow,
          atCol: acc.pending.firstMetricCol,
        })
        continue
      }
      const blockId = `${ws.name}:${acc.pending.firstMetricCol}`
      normaliseReachPcts(acc.rows, warnings, blockId)
      const name = acc.columnName
      blocks.push({
        blockId,
        columnName: name,
        isBase: name.trim().toLowerCase() === "total",
        labelCol: acc.labelCol,
        metrics: acc.pending.metrics,
        unweightedN: acc.unweightedN,
        popn000: acc.popn000,
        rows: acc.rows,
      })
    }
  }

  if (blocks.length === 0 && skipped.length === 0) {
    skipped.push({
      reason: "no metric header row",
      atRow: 1,
      atCol: 1,
    })
  }

  return {
    sheetName: ws.name,
    waveCode: provenance.waveCode,
    surveyPeriod: provenance.surveyPeriod,
    filter: provenance.filter,
    weights: provenance.weights,
    blocks,
    skipped,
  }
}

export async function parseRoyMorganWorkbook(
  buffer: Buffer,
  fileName: string
): Promise<RmWorkbookParse> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const warnings: string[] = []
  const sheets: RmSheet[] = []
  const budget = { remaining: MAX_BLOCKS }
  let sheetCount = 0
  workbook.eachSheet((ws) => {
    if (sheetCount >= MAX_SHEETS) {
      if (sheetCount === MAX_SHEETS) {
        warnings.push("stopped at 25 worksheets")
      }
      sheetCount += 1
      return
    }
    sheetCount += 1
    sheets.push(parseSheet(ws, warnings, budget))
  })
  return { fileName, sheets, warnings }
}
