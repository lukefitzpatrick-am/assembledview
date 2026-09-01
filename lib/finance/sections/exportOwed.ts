import { saveAs } from "file-saver"

import {
  OWED_BUCKET_IDS,
  type OwedBucket,
  type OwedLedgerPayload,
} from "@/lib/finance/sections/owedLedger"

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

const BUCKET_LABEL: Record<OwedBucket, string> = {
  not_yet_due: "Not yet due",
  d1_14: "1-14 days",
  d15_30: "15-30 days",
  d31_60: "31-60 days",
  d60_plus: "60+ days",
}

/**
 * Excel export of the Owed (debtors) ledger.
 * Money as dollars at the edge. No PDF blob URLs (CB-6).
 */
export async function exportOwedExcel(
  payload: OwedLedgerPayload,
  filename: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Owed")

  sheet.columns = [
    { header: "Client", key: "client", width: 28 },
    { header: "Invoice #", key: "invoice", width: 16 },
    { header: "Reference", key: "reference", width: 28 },
    { header: "Issued", key: "issued", width: 12 },
    { header: "Due", key: "due", width: 12 },
    { header: "Amount (ex-GST)", key: "amount", width: 16 },
    { header: "Paid (ex-GST)", key: "paid", width: 16 },
    { header: "Outstanding (ex-GST)", key: "outstanding", width: 20 },
    { header: "Age (days)", key: "age", width: 12 },
    { header: "Bucket", key: "bucket", width: 14 },
    { header: "State", key: "state", width: 12 },
    { header: "PDF available", key: "pdf", width: 14 },
  ]

  for (const row of payload.rows) {
    sheet.addRow({
      client: row.clientName,
      invoice: row.invoiceNumber,
      reference: row.reference ?? "",
      issued: row.issueDate ?? "",
      due: row.dueDate ?? "",
      amount: dollars(row.totalCents),
      paid: dollars(row.paidCents),
      outstanding: dollars(row.outstandingCents),
      age: row.daysOverdue,
      bucket: BUCKET_LABEL[row.bucket],
      state: row.state,
      pdf: row.pdfAvailable ? "Yes" : "No",
    })
  }

  for (const key of ["amount", "paid", "outstanding"] as const) {
    sheet.getColumn(key).numFmt = "$#,##0.00"
  }

  const buckets = workbook.addWorksheet("Buckets")
  buckets.columns = [
    { header: "Bucket", key: "bucket", width: 16 },
    { header: "Count", key: "count", width: 10 },
    { header: "Outstanding (ex-GST)", key: "amount", width: 22 },
  ]
  for (const id of OWED_BUCKET_IDS) {
    const b = payload.buckets[id]
    buckets.addRow({
      bucket: BUCKET_LABEL[id],
      count: b.count,
      amount: dollars(b.amountCents),
    })
  }
  buckets.addRow({
    bucket: "Total",
    count: payload.totals.count,
    amount: dollars(payload.totals.outstandingCents),
  })
  buckets.getColumn("amount").numFmt = "$#,##0.00"

  const meta = workbook.addWorksheet("Coverage")
  meta.addRow(["As of (Sydney)", payload.asOf])
  meta.addRow(["Resolved invoices", payload.coverage.resolvedCount])
  meta.addRow(["Unresolved invoices", payload.coverage.unresolvedCount])
  meta.addRow(["Resolved %", payload.coverage.resolvedPct])
  meta.addRow(["Unresolved amount (ex-GST)", dollars(payload.coverage.unresolvedAmountCents)])
  meta.addRow(["Basis", "Xero AR AUTHORISED outstanding, ex-GST. Not FY-clipped by default."])
  meta.getColumn(1).width = 28
  meta.getColumn(2).width = 48

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, filename)
}
