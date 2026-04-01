import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { BillingRecord } from "@/lib/types/financeBilling"
import type { PublisherGroup } from "@/components/finance/PublishersView"

export async function exportBillingRecordsExcel(records: BillingRecord[], filename: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Billing")
  sheet.columns = [
    { header: "Client", key: "client", width: 24 },
    { header: "MBA", key: "mba", width: 16 },
    { header: "Campaign", key: "campaign", width: 32 },
    { header: "Type", key: "type", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Month", key: "month", width: 12 },
    { header: "Total", key: "total", width: 14 },
  ]
  for (const row of records) {
    sheet.addRow({
      client: row.client_name,
      mba: row.mba_number || "",
      campaign: row.campaign_name || "",
      type: row.billing_type,
      status: row.status,
      month: row.billing_month,
      total: Number(row.total || 0),
    })
  }
  sheet.getColumn("total").numFmt = "$#,##0.00"
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, filename)
}

export function exportBillingRecordsCsv(records: BillingRecord[], filename: string) {
  const rows = [
    ["client_name", "mba_number", "campaign_name", "billing_type", "status", "billing_month", "total"].join(","),
    ...records.map((r) =>
      [
        `"${(r.client_name || "").replace(/"/g, '""')}"`,
        `"${(r.mba_number || "").replace(/"/g, '""')}"`,
        `"${(r.campaign_name || "").replace(/"/g, '""')}"`,
        r.billing_type,
        r.status,
        r.billing_month,
        Number(r.total || 0).toFixed(2),
      ].join(",")
    ),
  ]
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
  saveAs(blob, filename)
}

export async function exportPublishersExcel(publishers: PublisherGroup[], monthLabel: string, fileStem: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Publisher invoices")
  sheet.columns = [{ width: 28 }, { width: 26 }, { width: 18 }, { width: 36 }, { width: 16 }]
  sheet.mergeCells(1, 1, 1, 5)
  sheet.getCell(1, 1).value = `Publisher media invoices — ${monthLabel}`
  const headers = ["Publisher", "Client", "MBA number", "Campaign", "Media"]
  headers.forEach((h, i) => (sheet.getCell(3, i + 1).value = h))
  let row = 4
  for (const pub of publishers) {
    for (const client of pub.clients) {
      for (const campaign of client.campaigns) {
        sheet.getCell(row, 1).value = pub.publisherName
        sheet.getCell(row, 2).value = client.clientName
        sheet.getCell(row, 3).value = campaign.mbaNumber
        sheet.getCell(row, 4).value = campaign.campaignName
        sheet.getCell(row, 5).value = campaign.totalMedia
        sheet.getCell(row, 5).numFmt = "$#,##0.00"
        row++
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, `${fileStem}_${monthLabel.replace(/\s+/g, "_")}.xlsx`)
}
