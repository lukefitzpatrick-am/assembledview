/**
 * Compare two media-plan workbooks. Totals cells are the MBA block
 * generateMediaPlan writes from mbaData (gross_media by media type plus
 * service_fee / production / adserving / totals_ex_gst / total_inc_gst).
 * Styling and column widths are out of scope.
 */

import ExcelJS from "exceljs"

import { parseMoneyInput } from "@/lib/format/money"

export type TotalsCellCompare = {
  label: string
  expected: number | null
  actual: number | null
  diff: number | null
  match: boolean
}

export type SheetCompare = {
  name: string
  presence: "both" | "expected_only" | "actual_only"
  expectedRowCount: number
  actualRowCount: number
  totals: TotalsCellCompare[]
}

export type WorkbookCompareReport = {
  sheets: SheetCompare[]
  hasTotalsDiff: boolean
}

const TOTALS_END_LABEL = "Total Inc GST:"

function cellLabel(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "object") {
    const obj = value as { text?: unknown; richText?: Array<{ text?: string }>; result?: unknown }
    if (typeof obj.text === "string") return obj.text.trim()
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((p) => p.text ?? "").join("").trim()
    }
    if (obj.result != null) return cellLabel(obj.result)
  }
  return String(value).trim()
}

function cellNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "object" && value != null && "result" in value) {
    return cellNumber((value as { result: unknown }).result)
  }
  return parseMoneyInput(typeof value === "string" ? value : cellLabel(value))
}

function moneyEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

export function extractMediaPlanTotalsBlock(
  sheet: ExcelJS.Worksheet,
): Array<{ label: string; value: number }> {
  const cells: Array<{ label: string; value: number }> = []
  let inBlock = false
  sheet.eachRow((row) => {
    const label = cellLabel(row.getCell(13).value)
    if (label === "Media Type") {
      inBlock = true
      return
    }
    if (!inBlock || !label) return
    const value = cellNumber(row.getCell(14).value)
    if (value == null) return
    cells.push({ label, value })
    if (label === TOTALS_END_LABEL) inBlock = false
  })
  return cells
}

function compareTotals(
  expected: Array<{ label: string; value: number }>,
  actual: Array<{ label: string; value: number }>,
): TotalsCellCompare[] {
  const expectedByLabel = new Map(expected.map((c) => [c.label, c.value]))
  const actualByLabel = new Map(actual.map((c) => [c.label, c.value]))
  const labels: string[] = []
  for (const cell of expected) {
    if (!labels.includes(cell.label)) labels.push(cell.label)
  }
  for (const cell of actual) {
    if (!labels.includes(cell.label)) labels.push(cell.label)
  }
  return labels.map((label) => {
    const exp = expectedByLabel.has(label) ? expectedByLabel.get(label)! : null
    const act = actualByLabel.has(label) ? actualByLabel.get(label)! : null
    const both = exp != null && act != null
    const match = both && moneyEqual(exp, act)
    return {
      label,
      expected: exp,
      actual: act,
      diff: both ? act - exp : null,
      match,
    }
  })
}

function sheetRowCount(sheet: ExcelJS.Worksheet | undefined): number {
  if (!sheet) return 0
  return sheet.rowCount ?? 0
}

export async function comparePlanWorkbooks(
  expectedPath: string,
  actualPath: string,
): Promise<WorkbookCompareReport> {
  const expectedWb = new ExcelJS.Workbook()
  const actualWb = new ExcelJS.Workbook()
  await expectedWb.xlsx.readFile(expectedPath)
  await actualWb.xlsx.readFile(actualPath)

  const expectedByName = new Map(expectedWb.worksheets.map((ws) => [ws.name, ws]))
  const actualByName = new Map(actualWb.worksheets.map((ws) => [ws.name, ws]))
  const names: string[] = []
  for (const ws of expectedWb.worksheets) names.push(ws.name)
  for (const ws of actualWb.worksheets) {
    if (!names.includes(ws.name)) names.push(ws.name)
  }

  const sheets: SheetCompare[] = names.map((name) => {
    const expectedSheet = expectedByName.get(name)
    const actualSheet = actualByName.get(name)
    const presence: SheetCompare["presence"] = expectedSheet && actualSheet
      ? "both"
      : expectedSheet
        ? "expected_only"
        : "actual_only"
    const totals =
      expectedSheet && actualSheet
        ? compareTotals(
            extractMediaPlanTotalsBlock(expectedSheet),
            extractMediaPlanTotalsBlock(actualSheet),
          )
        : []
    return {
      name,
      presence,
      expectedRowCount: sheetRowCount(expectedSheet),
      actualRowCount: sheetRowCount(actualSheet),
      totals,
    }
  })

  const hasTotalsDiff = sheets.some((sheet) =>
    sheet.totals.some((cell) => !cell.match),
  )
  return { sheets, hasTotalsDiff }
}

export function formatWorkbookCompareReport(report: WorkbookCompareReport): string {
  const lines: string[] = []
  for (const sheet of report.sheets) {
    lines.push(
      `sheet ${JSON.stringify(sheet.name)}  presence=${sheet.presence}  rows expected=${sheet.expectedRowCount} actual=${sheet.actualRowCount}`,
    )
    if (sheet.totals.length === 0) continue
    lines.push(
      `  ${"label".padEnd(28)}  ${"expected".padStart(12)}  ${"actual".padStart(12)}  ${"diff".padStart(12)}  match`,
    )
    for (const cell of sheet.totals) {
      const expected = cell.expected == null ? "—" : String(cell.expected)
      const actual = cell.actual == null ? "—" : String(cell.actual)
      const diff = cell.diff == null ? "—" : String(cell.diff)
      lines.push(
        `  ${cell.label.padEnd(28)}  ${expected.padStart(12)}  ${actual.padStart(12)}  ${diff.padStart(12)}  ${cell.match ? "Y" : "N"}`,
      )
    }
  }
  lines.push(report.hasTotalsDiff ? "TOTALS DIFF" : "TOTALS MATCH")
  return lines.join("\n")
}

const PDF_TOTAL_LABELS = [
  "Total Gross Media:",
  "Service Fee:",
  "Production:",
  "Adserving/Tech:",
  "Total ex. GST:",
  "Total inc. GST:",
] as const

export type PdfTotalsCompare = {
  label: string
  expected: number | null
  actual: number | null
  diff: number | null
  match: boolean
}

function parsePdfTotals(text: string): Map<string, number> {
  const out = new Map<string, number>()
  const collapsed = text.replace(/\s+/g, " ")
  for (const label of PDF_TOTAL_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = new RegExp(`${escaped}\\s*(\\$?[\\d,]+(?:\\.\\d{1,2})?)`).exec(
      collapsed,
    )
    if (!match) continue
    const value = parseMoneyInput(match[1] ?? "")
    if (value != null) out.set(label, value)
  }
  return out
}

export function compareMbaPdfTotals(
  expectedText: string,
  actualText: string,
): { cells: PdfTotalsCompare[]; hasTotalsDiff: boolean } {
  const expected = parsePdfTotals(expectedText)
  const actual = parsePdfTotals(actualText)
  const cells: PdfTotalsCompare[] = PDF_TOTAL_LABELS.map((label) => {
    const exp = expected.has(label) ? expected.get(label)! : null
    const act = actual.has(label) ? actual.get(label)! : null
    const both = exp != null && act != null
    const match = both && moneyEqual(exp, act)
    return {
      label,
      expected: exp,
      actual: act,
      diff: both ? act - exp : null,
      match,
    }
  })
  return {
    cells,
    hasTotalsDiff: cells.some((c) => !c.match),
  }
}
