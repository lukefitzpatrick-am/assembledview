/**
 * Fixed cost margin "Download Excel". Same lines and totals the page shows
 * (after its publisher and platform filters). Browser-side; read-only.
 */

import type ExcelJS from "exceljs"

import { BRAND, hexToArgb } from "@/lib/brand"
import { excelFont, paintSandHeader, stampAptos } from "@/lib/excel/brandSheet"
import {
  lineFlagLabels,
  type FixedCostMarginLine,
  type MarginSummary,
  type MarginTotals,
} from "@/lib/finance/sections/fixedCostMargin/compose"
import { fromCents } from "@/lib/money/cents"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const MONEY_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00'
const PCT_FMT = "0.0%;[Red]-0.0%"
const ARGB_NEGATIVE = hexToArgb(BRAND.functional.coralText)

export function fixedCostMarginFileStem(range: { from: string; to: string }): string {
  return `Fixed_cost_margin_${range.from}_${range.to}`
}

function money(cents: number | null): number | null {
  return cents == null ? null : fromCents(cents)
}

function writeHeader(ws: ExcelJS.Worksheet, headers: string[]): void {
  const row = ws.addRow(headers)
  row.eachCell((cell) => paintSandHeader(cell))
  ws.views = [{ state: "frozen", ySplit: 1 }]
}

function paintNegative(cell: ExcelJS.Cell, value: number | null, bold = false): void {
  if (value != null && value < 0) cell.font = excelFont({ bold, color: { argb: ARGB_NEGATIVE } })
}

function formatColumns(ws: ExcelJS.Worksheet, moneyCols: number[], pctCols: number[]): void {
  for (const c of moneyCols) ws.getColumn(c).numFmt = MONEY_FMT
  for (const c of pctCols) ws.getColumn(c).numFmt = PCT_FMT
}

const TOTAL_HEADERS = [
  "Billed",
  "Invoiced",
  "Actual platform spend",
  "Billed with platform cost",
  "Billed, no platform cost",
  "Margin $",
  "Margin %",
]

function totalCells(t: MarginTotals): Array<number | null> {
  return [
    money(t.billedCents),
    money(t.invoicedCents),
    money(t.actualCents),
    money(t.billedWithCostCents),
    money(t.billedWithoutCostCents),
    money(t.marginCents),
    t.marginPct,
  ]
}

function writeTotalsSheet(
  wb: ExcelJS.Workbook,
  name: string,
  keyHeader: string,
  rows: Array<{ key: string; totals: MarginTotals }>,
  grand: MarginTotals
): void {
  const ws = wb.addWorksheet(name)
  writeHeader(ws, [keyHeader, ...TOTAL_HEADERS])
  for (const r of [...rows, { key: "Total", totals: grand }]) {
    const row = ws.addRow([r.key, ...totalCells(r.totals)])
    const isTotal = r.key === "Total"
    if (isTotal) row.font = excelFont({ bold: true })
    paintNegative(row.getCell(7), money(r.totals.marginCents), isTotal)
  }
  formatColumns(ws, [2, 3, 4, 5, 6, 7], [8])
  ws.getColumn(1).width = 32
  for (let c = 2; c <= 8; c += 1) ws.getColumn(c).width = 18
  stampAptos(ws)
}

/** Workbook: one row per line and month, then client, publisher and month totals. */
export async function buildFixedCostMarginWorkbookBytes(
  lines: readonly FixedCostMarginLine[],
  summary: MarginSummary,
  notes: readonly string[]
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()

  const ws = wb.addWorksheet("Line months")
  writeHeader(ws, [
    "Client",
    "MBA",
    "Campaign",
    "Line ID",
    "Line name",
    "Publisher",
    "Platform",
    "Spend source",
    "Month",
    "Planned billed",
    "Invoiced",
    "Actual platform spend",
    "Margin $",
    "Margin %",
    "Flags",
  ])
  for (const line of lines) {
    const lineFlags = lineFlagLabels(line).filter((f) => !f.startsWith("Spend outside"))
    for (const m of line.months) {
      const flags = [...lineFlags]
      if (m.outsideLineMonths) flags.push("Spend outside line months")
      const row = ws.addRow([
        line.clientName,
        line.mbaNumber,
        line.campaignName,
        line.lineItemId,
        line.lineName,
        line.publisher,
        line.platform,
        line.sources.join(", "),
        m.month,
        money(m.billedCents),
        m.invoiced ? money(m.invoicedCents) : null,
        money(m.actualCents),
        money(m.marginCents),
        m.marginPct,
        flags.join("; "),
      ])
      paintNegative(row.getCell(13), money(m.marginCents))
    }
  }
  formatColumns(ws, [10, 11, 12, 13], [14])
  const widths = [24, 12, 28, 16, 28, 20, 18, 18, 10, 14, 14, 16, 14, 10, 40]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  stampAptos(ws)

  writeTotalsSheet(
    wb,
    "By client",
    "Client",
    summary.byClient.map((c) => ({ key: c.clientName, totals: c.totals })),
    summary.grand
  )
  writeTotalsSheet(
    wb,
    "By publisher",
    "Publisher",
    summary.byPublisher.map((p) => ({ key: p.publisher, totals: p.totals })),
    summary.grand
  )
  writeTotalsSheet(
    wb,
    "By month",
    "Month",
    summary.byMonth.map((m) => ({ key: m.month, totals: m.totals })),
    summary.grand
  )

  const nw = wb.addWorksheet("Notes")
  for (const n of notes) nw.addRow([n])
  nw.getColumn(1).width = 120
  stampAptos(nw)

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export async function downloadFixedCostMarginWorkbook(
  lines: readonly FixedCostMarginLine[],
  summary: MarginSummary,
  notes: readonly string[],
  range: { from: string; to: string },
  deps: { save: (blob: Blob, filename: string) => void }
): Promise<void> {
  const bytes = await buildFixedCostMarginWorkbookBytes(lines, summary, notes)
  deps.save(new Blob([bytes], { type: XLSX_TYPE }), `${fixedCostMarginFileStem(range)}.xlsx`)
}
