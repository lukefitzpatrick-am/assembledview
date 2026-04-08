import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { billingRecordsToFinanceCampaigns } from "@/lib/finance/billingRecordToCampaignData"
import {
  writeMediaFinanceWorksheet,
  writeRetainerFinanceWorksheet,
  writeSowFinanceWorksheet,
  workbookToXlsxBuffer,
} from "@/lib/finance/excelFinanceExport"
import { exportBillingRecordsExcel, exportPayablesPublisherDetailExcel } from "@/lib/finance/export"

function sanitizeExcelSheetName(name: string): string {
  const t = name.replace(/[*?:/\\[\]]/g, " ").trim().slice(0, 31)
  return t.length > 0 ? t : "Sheet"
}

function usedSheetNamesTracker() {
  const used = new Map<string, number>()
  return (base: string) => {
    const s = sanitizeExcelSheetName(base)
    const n = (used.get(s) ?? 0) + 1
    used.set(s, n)
    return n === 1 ? s : sanitizeExcelSheetName(`${s} (${n})`)
  }
}

function filenameMonthSegment(monthLabel: string): string {
  return monthLabel.replace(/\s+/g, "_")
}

/**
 * Invoice-style workbook: Media + Scopes + one sheet per retainer (matches legacy finance routes).
 */
export async function exportReceivablesWorkbook(
  records: BillingRecord[],
  monthLabel: string,
  fileStem: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const media = records.filter((r) => r.billing_type === "media")
  const sow = records.filter((r) => r.billing_type === "sow")
  const retainer = records.filter((r) => r.billing_type === "retainer")

  if (media.length > 0) {
    await writeMediaFinanceWorksheet(workbook, "Media", billingRecordsToFinanceCampaigns(media))
  }
  if (sow.length > 0) {
    await writeSowFinanceWorksheet(workbook, "Scopes", billingRecordsToFinanceCampaigns(sow))
  }
  if (retainer.length > 0) {
    const nextName = usedSheetNamesTracker()
    for (const r of retainer) {
      const invoiceIso = r.invoice_date?.trim()
        ? r.invoice_date
        : r.billing_month
          ? `${r.billing_month}-01`
          : new Date().toISOString().slice(0, 10)
      const clientLabel = (r.client_name || "Client").trim() || "Client"
      await writeRetainerFinanceWorksheet(workbook, nextName(clientLabel), {
        clientName: r.client_name,
        mbaIdentifier: r.mba_number || String(r.id),
        paymentDays: r.payment_days,
        paymentTerms: r.payment_terms,
        invoiceDateIso: invoiceIso,
        monthlyRetainer: Number(r.total || 0),
      })
    }
  }

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet("No data")
    ws.getCell(1, 1).value = "No receivables to export for the current filters."
  }

  const buffer = await workbookToXlsxBuffer(workbook)
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, `${fileStem}_${filenameMonthSegment(monthLabel)}.xlsx`)
}

/** Payables line-detail workbook (agency total excludes client-paid-direct lines). */
export async function exportPayablesWorkbook(
  records: BillingRecord[],
  monthLabel: string,
  fileStem: string
): Promise<void> {
  await exportPayablesPublisherDetailExcel(records, monthLabel, fileStem)
}

/** Flat grid export (secondary “flat list” option). */
export async function exportFlatBillingWorkbook(records: BillingRecord[], filename: string): Promise<void> {
  await exportBillingRecordsExcel(records, filename)
}
