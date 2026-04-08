import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { BillingRecord } from "@/lib/types/financeBilling"
import type { PublisherGroup } from "@/lib/types/financePublisherGroup"

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

export type PayablesDetailExportRow = {
  publisher: string
  client: string
  mba: string
  campaign: string
  mediaType: string
  description: string
  agencyOwed: number
  clientPaidDirect: number
}

/** One row per delivery line; agency totals exclude client-paid rows. */
export function buildPayablesDetailExportRows(records: BillingRecord[]): PayablesDetailExportRow[] {
  const rows: PayablesDetailExportRow[] = []
  for (const r of records) {
    if (r.billing_type !== "payable") continue
    const sorted = [...(r.line_items || [])].sort((a, b) => a.sort_order - b.sort_order)
    for (const li of sorted) {
      const amt = Number(li.amount || 0)
      if (amt <= 0) continue
      const clientPaid = li.client_pays_media === true
      rows.push({
        publisher: (li.publisher_name || "").trim() || "—",
        client: (r.client_name || "").trim(),
        mba: (r.mba_number || "").trim(),
        campaign: (r.campaign_name || "").trim(),
        mediaType: (li.media_type || "").trim(),
        description: (li.description || "").trim(),
        agencyOwed: clientPaid ? 0 : amt,
        clientPaidDirect: clientPaid ? amt : 0,
      })
    }
  }
  rows.sort((a, b) => {
    const p = a.publisher.localeCompare(b.publisher, undefined, { sensitivity: "base" })
    if (p !== 0) return p
    const c = a.client.localeCompare(b.client, undefined, { sensitivity: "base" })
    if (c !== 0) return c
    return a.campaign.localeCompare(b.campaign, undefined, { sensitivity: "base" })
  })
  return rows
}

/**
 * Line-level payables workbook: **Total (agency owed)** sums column G only (client-paid amounts are in column H, not included in the total).
 */
export async function exportPayablesPublisherDetailExcel(
  records: BillingRecord[],
  monthLabel: string,
  fileStem: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Payables")
  sheet.columns = [
    { width: 22 },
    { width: 22 },
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 36 },
    { width: 14 },
    { width: 18 },
  ]
  sheet.mergeCells(1, 1, 1, 8)
  sheet.getCell(1, 1).value = `Payables — ${monthLabel}`
  const headers = [
    "Publisher",
    "Client",
    "MBA",
    "Campaign",
    "Media",
    "Description",
    "Agency owed",
    "Client paid direct",
  ]
  headers.forEach((h, i) => {
    sheet.getCell(3, i + 1).value = h
  })

  const data = buildPayablesDetailExportRows(records)
  const firstDataRow = 4
  let row = firstDataRow
  for (const dr of data) {
    sheet.getCell(row, 1).value = dr.publisher
    sheet.getCell(row, 2).value = dr.client
    sheet.getCell(row, 3).value = dr.mba
    sheet.getCell(row, 4).value = dr.campaign
    sheet.getCell(row, 5).value = dr.mediaType
    sheet.getCell(row, 6).value = dr.description
    sheet.getCell(row, 7).value = dr.agencyOwed
    sheet.getCell(row, 8).value = dr.clientPaidDirect
    sheet.getCell(row, 7).numFmt = "$#,##0.00"
    sheet.getCell(row, 8).numFmt = "$#,##0.00"
    row++
  }
  const lastDataRow = row - 1

  if (data.length > 0) {
    const totalRow = row + 1
    sheet.getCell(totalRow, 1).value = "Total (agency owed)"
    sheet.mergeCells(totalRow, 1, totalRow, 6)
    sheet.getCell(totalRow, 7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }
    sheet.getCell(totalRow, 7).numFmt = "$#,##0.00"
    sheet.getCell(totalRow, 8).value = "—"
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, `${fileStem}_${monthLabel.replace(/\s+/g, "_")}.xlsx`)
}

export function exportPayablesDetailCsv(records: BillingRecord[], filename: string): void {
  const rows = buildPayablesDetailExportRows(records)
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const header = [
    "publisher",
    "client",
    "mba",
    "campaign",
    "media",
    "description",
    "agency_owed",
    "client_paid_direct",
  ].join(",")
  const body = rows.map((r) =>
    [
      esc(r.publisher),
      esc(r.client),
      esc(r.mba),
      esc(r.campaign),
      esc(r.mediaType),
      esc(r.description),
      r.agencyOwed.toFixed(2),
      r.clientPaidDirect.toFixed(2),
    ].join(",")
  )
  const agencySum = rows.reduce((s, r) => s + r.agencyOwed, 0)
  const totalLine = ["Total (agency owed)", "", "", "", "", "", agencySum.toFixed(2), "—"].join(",")
  const blob = new Blob([[header, ...body, totalLine].join("\n")], { type: "text/csv;charset=utf-8;" })
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
