/**
 * Clients billing review download (Download Excel / Download CSV).
 *
 * Builds the same workbook and CSV the Send to accounts pack produces, from
 * the records the invoicing page is showing, so finance can check invoices
 * before sending. Every row shown is included, approved or not, with its
 * status. Read-only: the only network call is GET /api/clients for legal
 * name + ABN. No exported_at, no status change, no API writes.
 */

import { billingRecordsToFinanceCampaigns } from "@/lib/finance/billingRecordToCampaignData"
import { buildReceivablesWorkbookBytes } from "@/lib/finance/exportFinanceHub"
import { groupInvoiceMediaRows } from "@/lib/finance/groupInvoiceMediaRows"
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

function csvText(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

export const INVOICING_REVIEW_CSV_HEADER = [
  "row_type",
  "client_name",
  "mba_number",
  "campaign_name",
  "billing_type",
  "status",
  "billing_month",
  "item_code",
  "media_type",
  "description",
  "amount",
].join(",")

/**
 * FB-2 review CSV: the same rows as the review workbook, one CSV row each.
 * `row_type`: `line` (grouped media line), `subtotal` (per supplier, display
 * only), `service` (fee, ad serving, production, scope, retainer), `total`
 * (invoice block total). An import sums `line` and `service` rows only.
 */
export function buildInvoicingReviewCsv(records: BillingRecord[]): string {
  const campaigns = billingRecordsToFinanceCampaigns(records, undefined, {
    statusLabel: (r) => r.status || "",
  })
  const out: string[] = [INVOICING_REVIEW_CSV_HEADER]
  for (const c of campaigns) {
    const head = [
      csvText((c.clientName || "").trim()),
      csvText((c.mbaNumber || "").trim()),
      csvText((c.campaignName || "").trim()),
      c.billingType ?? "",
      c.status ?? "",
      c.billingMonth ?? "",
    ]
    const row = (type: string, itemCode: string, mediaType: string, description: string, cents: number) =>
      out.push(
        [type, ...head, csvText(itemCode), csvText(mediaType), csvText(description), csvMoney(cents)].join(",")
      )
    const mediaRows =
      c.billingType === "media"
        ? groupInvoiceMediaRows(c.lineItems)
        : c.lineItems.map((li) => ({
            rowType: "line" as const,
            itemCode: li.itemCode,
            mediaType: li.mediaType,
            description: li.description,
            amountCents: Math.round(li.amount * 100),
          }))
    for (const r of mediaRows) row(r.rowType, r.itemCode, r.mediaType, r.description, r.amountCents)
    for (const s of c.serviceRows) row("service", s.itemCode, s.service, "", Math.round(s.amount * 100))
    row("total", "", "", "Total", Math.round(c.total * 100))
  }
  return out.join("\n")
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
