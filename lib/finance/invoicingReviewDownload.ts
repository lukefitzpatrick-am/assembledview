/**
 * Clients billing review download (Download Excel / Download CSV).
 *
 * Builds the same workbook and CSV the Send to accounts pack produces, from
 * the records the invoicing page is showing, so finance can check invoices
 * before sending. Every row shown is included, approved or not, with its
 * status. Read-only: the only network call is GET /api/clients for legal
 * name + ABN. No exported_at, no status change, no API writes.
 */

import { buildReceivablesWorkbookBytes } from "@/lib/finance/exportFinanceHub"
import { buildInvoiceLinesCsv, INVOICE_LINES_CSV_HEADER } from "@/lib/finance/invoiceLinesCsv"
import {
  loadFinanceExcelClientMeta,
  type FinanceExcelClientMetaLoad,
} from "@/lib/finance/excelFinanceExport"
import { type AccountsPackRow, type PackBillingType } from "@/lib/finance/sendToAccounts"
import type { BillingRecord } from "@/lib/types/financeBilling"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export type InvoicingReviewDeps = {
  save: (blob: Blob, filename: string) => void
  loadClientMeta?: () => Promise<FinanceExcelClientMetaLoad>
}

export function invoicingReviewFileStem(range: { from: string; to: string }): string {
  return `Clients_billing_${range.from}_${range.to}`
}

/** Pack CSV columns and quoting, for every row shown (status = record status, as the pack). */
export function invoicingReviewCsvRows(records: BillingRecord[]): AccountsPackRow[] {
  return records.map((record) => ({
    invoiceKey: record.invoice_key?.trim() ?? "",
    persistedId: Number(record.persisted_record_id) || 0,
    clientsId: Number(record.clients_id) || 0,
    clientName: (record.client_name || "").trim(),
    mbaNumber: (record.mba_number || "").trim(),
    campaignName: (record.campaign_name || "").trim(),
    billingType: record.billing_type as PackBillingType,
    status: record.status || "",
    billingMonth: record.billing_month,
    total: Number(record.total || 0),
    blockers: [],
  }))
}

/** Review CSV: the shared invoice lines CSV (same builder as the Send to accounts pack). */
export const INVOICING_REVIEW_CSV_HEADER = INVOICE_LINES_CSV_HEADER

export function buildInvoicingReviewCsv(records: BillingRecord[]): string {
  return buildInvoiceLinesCsv(records)
}

export async function downloadInvoicingReviewWorkbook(
  records: BillingRecord[],
  range: { from: string; to: string },
  deps: InvoicingReviewDeps
): Promise<{ missingLegalBusinessNames: Array<{ clientId: number; displayName: string }> }> {
  const load = deps.loadClientMeta ?? loadFinanceExcelClientMeta
  const { metaByClientId, missingLegalBusinessNames } = await load()
  const bytes = await buildReceivablesWorkbookBytes(records, metaByClientId, { review: true })
  deps.save(new Blob([bytes], { type: XLSX_TYPE }), `${invoicingReviewFileStem(range)}.xlsx`)
  const shownClientIds = new Set(records.map((r) => Number(r.clients_id)))
  return {
    missingLegalBusinessNames: missingLegalBusinessNames.filter((c) =>
      shownClientIds.has(c.clientId)
    ),
  }
}

export function downloadInvoicingReviewCsv(
  records: BillingRecord[],
  range: { from: string; to: string },
  deps: Pick<InvoicingReviewDeps, "save">
): void {
  const csv = buildInvoicingReviewCsv(records)
  deps.save(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `${invoicingReviewFileStem(range)}.csv`
  )
}
