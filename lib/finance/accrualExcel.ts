import type ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { AccrualRow } from "@/lib/finance/computeAccrual"
import { buildAccrualDetailRows } from "@/lib/finance/accrualDetailRows"
import { paintSandHeader, stampAptos } from "@/lib/excel/brandSheet"

const TEXT_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "left",
  vertical: "middle",
  wrapText: true,
}

const AMOUNT_HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
}

const AMOUNT_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "right",
  vertical: "middle",
  wrapText: true,
}

function applyAccrualSummaryAlignment(sheet: ExcelJS.Worksheet) {
  const moneyCols = [3, 4, 5, 6]
  const textCols = [1, 2, 7]
  sheet.eachRow((row, rowNumber) => {
    for (const c of textCols) {
      row.getCell(c).alignment = TEXT_ALIGNMENT as ExcelJS.Alignment
    }
    for (const c of moneyCols) {
      row.getCell(c).alignment = (rowNumber === 1 ? AMOUNT_HEADER_ALIGNMENT : AMOUNT_ALIGNMENT) as ExcelJS.Alignment
    }
  })
}

function applyAccrualDetailAlignment(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).alignment = TEXT_ALIGNMENT as ExcelJS.Alignment
    }
    row.getCell(8).alignment = (rowNumber === 1 ? AMOUNT_HEADER_ALIGNMENT : AMOUNT_ALIGNMENT) as ExcelJS.Alignment
  })
}

export async function exportAccrualWorkbook(rows: AccrualRow[], filename: string) {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()

  const summary = workbook.addWorksheet("Accrual by client")
  summary.columns = [
    { header: "Client", key: "client", width: 28 },
    { header: "Month", key: "month", width: 12 },
    { header: "Receivable", key: "recv", width: 16 },
    { header: "Payable", key: "pay", width: 16 },
    { header: "Fees", key: "fees", width: 14 },
    { header: "Accrual", key: "accrual", width: 16 },
    { header: "Reconciled", key: "recon", width: 12 },
  ]
  for (const r of rows) {
    summary.addRow({
      client: r.client_name,
      month: r.month,
      recv: r.receivable_total,
      pay: r.payable_total,
      fees: r.fees_total,
      accrual: r.accrual,
      recon: r.reconciled ? "Yes" : "No",
    })
  }
  for (const col of ["recv", "pay", "fees", "accrual"] as const) {
    summary.getColumn(col).numFmt = "$#,##0.00"
  }
  applyAccrualSummaryAlignment(summary)
  summary.getRow(1).eachCell({ includeEmpty: false }, (cell) => paintSandHeader(cell))
  stampAptos(summary)

  const detail = workbook.addWorksheet("Detail (contributors)")
  detail.columns = [
    { header: "Client", key: "client", width: 24 },
    { header: "Month", key: "month", width: 12 },
    { header: "Side", key: "side", width: 30 },
    { header: "Type", key: "type", width: 12 },
    { header: "MBA", key: "mba", width: 14 },
    { header: "Campaign", key: "campaign", width: 32 },
    { header: "Status", key: "status", width: 12 },
    { header: "Amount", key: "amount", width: 16 },
  ]

  for (const d of buildAccrualDetailRows(rows)) detail.addRow(d)
  detail.getColumn("amount").numFmt = "$#,##0.00"
  applyAccrualDetailAlignment(detail)
  detail.getRow(1).eachCell({ includeEmpty: false }, (cell) => paintSandHeader(cell))
  stampAptos(detail)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, filename)
}
