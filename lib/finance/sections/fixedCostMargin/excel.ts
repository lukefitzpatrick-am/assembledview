/**
 * Fixed cost margin "Download Excel". Same lines and totals the page shows
 * (after its publisher and platform filters). Browser-side; read-only.
 */

import type ExcelJS from "exceljs"

import { BRAND, hexToArgb } from "@/lib/brand"
import { excelFont, paintSandHeader, stampAptos } from "@/lib/excel/brandSheet"
import {
  lineFlagLabels,
  type Dv360CheckRow,
  type FixedCostBillLineView,
  type FixedCostBillTotals,
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
  "Actual cost",
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

export type FixedCostMarginWorkbookBills = {
  billLines: readonly FixedCostBillLineView[]
  billTotals: readonly FixedCostBillTotals[]
  /** DV360 vs Five Stones check by MBA-month (MAR-10). */
  dv360Rows?: readonly Dv360CheckRow[]
}

function writeDv360Sheet(wb: ExcelJS.Workbook, rows: readonly Dv360CheckRow[]): void {
  const ws = wb.addWorksheet("DV360 vs Five Stones")
  writeHeader(ws, [
    "Client",
    "MBA",
    "Month",
    "Report DV360 lines",
    "DV360 AMOUNT_SPENT (all MBA DV360 lines)",
    "DV360 AMOUNT_SPENT (report lines)",
    "Five Stones bill (ex GST)",
    "Five Stones pending",
    "Gap $ (AMOUNT_SPENT less bill)",
    "Gap %",
    "Bill status",
    "Five Stones bills",
  ])
  for (const r of rows) {
    const row = ws.addRow([
      r.clientName,
      r.mbaNumber,
      r.month,
      r.lineItemIds.join(", "),
      money(r.mbaDv360SpendCents),
      money(r.reportDv360SpendCents),
      money(r.fiveStonesBillCents),
      money(r.pendingBillCents),
      money(r.gapCents),
      r.gapPct,
      r.statuses.join(", "),
      r.invoiceNumbers.join(", "),
    ])
    paintNegative(row.getCell(9), money(r.gapCents))
  }
  formatColumns(ws, [5, 6, 7, 8, 9], [10])
  const widths = [24, 12, 10, 30, 22, 22, 18, 14, 18, 10, 18, 22]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  stampAptos(ws)
}

const BILL_STATE_LABEL: Record<string, string> = {
  matched: "Matched",
  ambiguous: "Ambiguous (match by hand)",
  unmatched: "Unmatched (match by hand)",
  fee: "Fee (not media cost)",
  production: "Production (not media cost)",
}

const METHOD_LABEL: Record<string, string> = {
  cf_placement: "CF placement (PL id)",
  mba_publisher: "MBA + publisher (only line)",
  mba_publisher_month_amount: "MBA + publisher + month + amount",
}

export function billStateLabel(state: string): string {
  return BILL_STATE_LABEL[state] ?? state
}

export function billMethodLabel(method: string | null): string {
  return method ? METHOD_LABEL[method] ?? method : ""
}

function writeBillLinesSheet(wb: ExcelJS.Workbook, bills: FixedCostMarginWorkbookBills): void {
  const ws = wb.addWorksheet("Bill lines")
  writeHeader(ws, [
    "Supplier",
    "Bill",
    "Status",
    "Counts as cost",
    "Issue date",
    "Billed month",
    "Delivered month",
    "Kind",
    "Description",
    "Media owner / placement",
    "Publisher",
    "MBA",
    "MBA from",
    "Client",
    "Line ID",
    "In this report",
    "Match",
    "Match method",
    "Candidates",
    "Reason",
    "Gross (ex GST)",
    "AA rebate",
    "Net cost",
  ])
  for (const b of bills.billLines) {
    ws.addRow([
      b.supplierKind,
      b.invoiceNumber,
      b.status,
      b.statusClass === "counted" ? "Yes" : b.statusClass === "pending" ? "Pending" : "No",
      b.issueDate,
      b.billedMonth,
      b.deliveredMonth,
      b.kind,
      b.description,
      b.placementId ?? b.mediaOwnerText,
      b.publisher ?? "",
      b.mbaNumber ?? "",
      b.mbaSource ?? "",
      b.clientName,
      b.lineItemId ?? "",
      b.inReport ? "Yes" : "No",
      billStateLabel(b.state),
      billMethodLabel(b.method),
      b.candidates.join(", "),
      b.reason,
      money(b.grossCents),
      money(b.rebateCents),
      money(b.netCents),
    ])
  }
  formatColumns(ws, [21, 22, 23], [])
  const widths = [22, 34, 12, 10, 12, 10, 10, 11, 48, 24, 22, 12, 12, 22, 16, 8, 22, 26, 24, 48, 14, 12, 14]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  stampAptos(ws)

  const tw = wb.addWorksheet("Bill match totals")
  writeHeader(tw, [
    "Supplier",
    "Bill lines",
    "Gross (ex GST)",
    "Matched",
    "Matched, in this report",
    "Ambiguous",
    "Unmatched",
    "Fee",
    "Production",
    "Pending (draft or submitted)",
  ])
  for (const t of bills.billTotals) {
    tw.addRow([
      t.supplierKind,
      t.lines,
      money(t.totalCents),
      money(t.matchedCents),
      money(t.matchedInReportCents),
      money(t.ambiguousCents),
      money(t.unmatchedCents),
      money(t.feeCents),
      money(t.productionCents),
      money(t.pendingCents),
    ])
  }
  formatColumns(tw, [3, 4, 5, 6, 7, 8, 9, 10], [])
  tw.getColumn(1).width = 26
  for (let c = 2; c <= 10; c += 1) tw.getColumn(c).width = 18
  stampAptos(tw)
}

function writeTimingSheet(wb: ExcelJS.Workbook, lines: readonly FixedCostMarginLine[]): void {
  const ws = wb.addWorksheet("Billed vs delivered")
  writeHeader(ws, [
    "Client",
    "MBA",
    "Line ID",
    "Publisher",
    "Cost from",
    "Month",
    "Cost, billed month",
    "Cost, delivered month",
    "Cost difference",
    "Client billed (billing schedule)",
    "Client delivery schedule",
    "Client difference",
  ])
  for (const line of lines) {
    for (const t of line.timing) {
      const row = ws.addRow([
        line.clientName,
        line.mbaNumber,
        line.lineItemId,
        line.publisher,
        line.costBasis === "xero_bill" ? "Xero bills" : "Platform spend",
        t.month,
        money(t.costBilledMonthCents),
        money(t.costDeliveredMonthCents),
        money(t.costDiffCents),
        money(t.clientBilledCents),
        money(t.clientDeliveryCents),
        money(t.clientDiffCents),
      ])
      paintNegative(row.getCell(9), money(t.costDiffCents))
      paintNegative(row.getCell(12), money(t.clientDiffCents))
    }
  }
  formatColumns(ws, [7, 8, 9, 10, 11, 12], [])
  const widths = [24, 12, 16, 22, 14, 10, 16, 16, 14, 18, 18, 14]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  stampAptos(ws)
}

/**
 * Workbook: one row per line and month, client, publisher and month totals,
 * the billed vs delivered view, and every bill line (matched or not).
 */
export async function buildFixedCostMarginWorkbookBytes(
  lines: readonly FixedCostMarginLine[],
  summary: MarginSummary,
  notes: readonly string[],
  bills: FixedCostMarginWorkbookBills = { billLines: [], billTotals: [] }
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
    "Actual cost",
    "Margin $",
    "Margin %",
    "Flags",
    "Cost from",
    "Bill gross",
    "AA rebate",
    "Pending bills",
    "Bill status",
    "Match method",
    "DV360 spend",
    "Five Stones bill (DV360, MBA-month share)",
    "DV360 gap $",
    "DV360 gap %",
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
        line.costBasis === "xero_bill" ? "Xero bills" : "Platform spend",
        line.costBasis === "xero_bill" ? money(m.billGrossCents) : null,
        line.costBasis === "xero_bill" ? money(m.billRebateCents) : null,
        line.costBasis === "xero_bill" ? money(m.pendingBillCents) : null,
        line.billStatuses.join(", "),
        line.billMethods.map((x) => billMethodLabel(x)).join(", "),
        m.dv360SpendCents ? money(m.dv360SpendCents) : null,
        money(m.fiveStonesBillCents),
        money(m.fiveStonesGapCents),
        m.fiveStonesGapPct,
      ])
      paintNegative(row.getCell(13), money(m.marginCents))
    }
  }
  formatColumns(ws, [10, 11, 12, 13, 17, 18, 19, 22, 23, 24], [14, 25])
  const widths = [24, 12, 28, 16, 28, 20, 18, 18, 10, 14, 14, 16, 14, 10, 40, 14, 14, 12, 14, 18, 30, 14, 20, 14, 10]
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

  writeTimingSheet(wb, lines)
  writeBillLinesSheet(wb, bills)
  writeDv360Sheet(wb, bills.dv360Rows ?? [])

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
  deps: { save: (blob: Blob, filename: string) => void },
  bills?: FixedCostMarginWorkbookBills
): Promise<void> {
  const bytes = await buildFixedCostMarginWorkbookBytes(lines, summary, notes, bills)
  deps.save(new Blob([bytes], { type: XLSX_TYPE }), `${fixedCostMarginFileStem(range)}.xlsx`)
}
