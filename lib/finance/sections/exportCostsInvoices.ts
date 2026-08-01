import { saveAs } from "file-saver"
import type { FinanceCostsSummaryPayload } from "@/lib/finance/sections/costsQuery"

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Excel export of the Costs invoices view (publisher×month + bill detail rows).
 * Reuses ExcelJS via dynamic import (same pattern as lib/finance/export.ts).
 */
export async function exportCostsInvoicesExcel(
  payload: FinanceCostsSummaryPayload,
  filename: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Publisher invoices")

  sheet.columns = [
    { header: "Publisher", key: "publisher", width: 28 },
    { header: "Month", key: "month", width: 10 },
    { header: "Booked (delivery)", key: "booked", width: 16 },
    { header: "AP billed", key: "ap", width: 14 },
    { header: "Delta", key: "delta", width: 14 },
    { header: "Invoice #", key: "invoice", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Due", key: "due", width: 12 },
    { header: "Amount due", key: "dueAmt", width: 14 },
    { header: "Contact", key: "contact", width: 28 },
    { header: "Attribution", key: "attr", width: 14 },
    { header: "PDF URL", key: "pdf", width: 40 },
  ]

  for (const row of payload.publisherMonths) {
    if (row.bills.length === 0) {
      sheet.addRow({
        publisher: row.publisher,
        month: row.month,
        booked: dollars(row.bookedCents),
        ap: dollars(row.apBilledCents),
        delta: dollars(row.deltaCents),
        invoice: "",
        status: "",
        due: "",
        dueAmt: "",
        contact: "",
        attr: "",
        pdf: "",
      })
      continue
    }
    for (const bill of row.bills) {
      sheet.addRow({
        publisher: row.publisher,
        month: row.month,
        booked: dollars(row.bookedCents),
        ap: dollars(row.apBilledCents),
        delta: dollars(row.deltaCents),
        invoice: bill.invoiceNumber ?? "",
        status: bill.status ?? "",
        due: bill.dueDate ?? "",
        dueAmt: dollars(bill.amountDueCents),
        contact: bill.contactName ?? "",
        attr: bill.heuristic ? "heuristic" : bill.attributionMethod,
        pdf: bill.pdfUrl ?? "",
      })
    }
  }

  for (const bill of payload.unattributedBills) {
    sheet.addRow({
      publisher: "Unattributed bills",
      month: bill.activityMonth,
      booked: 0,
      ap: dollars(bill.totalCents),
      delta: -dollars(bill.totalCents),
      invoice: bill.invoiceNumber ?? "",
      status: bill.status ?? "",
      due: bill.dueDate ?? "",
      dueAmt: dollars(bill.amountDueCents),
      contact: bill.contactName ?? "",
      attr: "unattributed",
      pdf: bill.pdfUrl ?? "",
    })
  }

  for (const key of ["booked", "ap", "delta", "dueAmt"] as const) {
    sheet.getColumn(key).numFmt = "$#,##0.00"
  }

  const meta = workbook.addWorksheet("Attribution")
  meta.addRow(["Rule", payload.attributionRule])
  meta.addRow([
    "Coverage identity %",
    payload.coverage.bookedWithPublisherIdentityPct,
  ])
  meta.addRow([
    "Coverage AP-month %",
    payload.coverage.bookedInMonthsWithAnyApBillPct,
  ])
  meta.getColumn(1).width = 24
  meta.getColumn(2).width = 80

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, filename)
}
