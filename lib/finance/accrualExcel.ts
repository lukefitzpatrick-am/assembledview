import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { AccrualRow } from "@/lib/finance/computeAccrual"

export async function exportAccrualWorkbook(rows: AccrualRow[], filename: string) {
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

  const detail = workbook.addWorksheet("Detail (contributors)")
  detail.columns = [
    { header: "Client", key: "client", width: 24 },
    { header: "Month", key: "month", width: 12 },
    { header: "Side", key: "side", width: 12 },
    { header: "Type", key: "type", width: 12 },
    { header: "MBA", key: "mba", width: 14 },
    { header: "Campaign", key: "campaign", width: 32 },
    { header: "Status", key: "status", width: 12 },
    { header: "Amount", key: "amount", width: 16 },
  ]

  for (const r of rows) {
    for (const rec of r.contributing_receivables) {
      detail.addRow({
        client: r.client_name,
        month: r.month,
        side: "Receivable",
        type: rec.billing_type,
        mba: rec.mba_number || "",
        campaign: rec.campaign_name || "",
        status: rec.status,
        amount: Number(rec.total || 0),
      })
    }
    for (const pay of r.contributing_payables) {
      const expected = (pay.line_items || []).reduce((s, li) => s + Number(li.amount || 0), 0)
      detail.addRow({
        client: r.client_name,
        month: r.month,
        side: "Payable (expected)",
        type: pay.billing_type,
        mba: pay.mba_number || "",
        campaign: pay.campaign_name || "",
        status: pay.status,
        amount: expected,
      })
    }
  }
  detail.getColumn("amount").numFmt = "$#,##0.00"

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, filename)
}
