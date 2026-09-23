import type { BillingRecord } from "@/lib/types/financeBilling"
import { filterApprovedReceivablesForExport } from "@/lib/finance/approvedReceivablesExport"
import { billingRecordsToFinanceCampaigns } from "@/lib/finance/billingRecordToCampaignData"
import {
  writeMediaFinanceWorksheet,
  writeRetainerFinanceWorksheet,
  writeSowFinanceWorksheet,
  workbookToXlsxBuffer,
  type FinanceExcelClientMeta,
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

/**
 * Invoice-style workbook buffer: Media + Scopes + one sheet per retainer.
 * Caller supplies legal name + ABN (empty legal already fallen back to display name).
 * Does not download and does not stamp `exported_at`.
 */
export async function buildReceivablesWorkbookBuffer(
  records: BillingRecord[],
  metaByClientId: Map<number, FinanceExcelClientMeta>
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const approved = filterApprovedReceivablesForExport(records)
  const media = approved.filter((r) => r.billing_type === "media")
  const sow = approved.filter((r) => r.billing_type === "sow")
  const retainer = approved.filter((r) => r.billing_type === "retainer")

  if (media.length > 0) {
    await writeMediaFinanceWorksheet(
      workbook,
      "Media",
      billingRecordsToFinanceCampaigns(media, metaByClientId)
    )
  }
  if (sow.length > 0) {
    await writeSowFinanceWorksheet(
      workbook,
      "Scopes",
      billingRecordsToFinanceCampaigns(sow, metaByClientId)
    )
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
      const meta = metaByClientId.get(r.clients_id)
      await writeRetainerFinanceWorksheet(workbook, nextName(clientLabel), {
        clientName: r.client_name,
        mbaIdentifier: r.mba_number || String(r.id),
        paymentDays: r.payment_days,
        paymentTerms: r.payment_terms,
        invoiceDateIso: invoiceIso,
        monthlyRetainer: Number(r.total || 0),
        legalBusinessName: meta?.legalBusinessName ?? "",
        abn: meta?.abn ?? "",
      })
    }
  }

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet("No data")
    ws.getCell(1, 1).value = "No receivables to export for the current filters."
  }

  const buffer = await workbookToXlsxBuffer(workbook)
  return Buffer.from(buffer)
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
