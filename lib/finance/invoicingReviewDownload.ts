/**
 * Clients billing review download (Download Excel / Download CSV).
 *
 * Builds the same workbook and CSV the Send to accounts pack produces, from
 * the records the invoicing page is showing, so finance can check invoices
 * before sending. Every row shown is included, approved or not, with its
 * status. Read-only: the network calls are GET /api/clients for legal name +
 * ABN and, for unsent media months, GET /api/finance/billing/above-plan-reason
 * (S14 held rows). No exported_at, no status change, no API writes.
 */

import { buildReceivablesWorkbookBytes } from "@/lib/finance/exportFinanceHub"
import { buildInvoiceLinesCsv } from "@/lib/finance/invoiceLinesCsv"
import {
  loadFinanceExcelClientMeta,
  type FinanceExcelClientMetaLoad,
} from "@/lib/finance/excelFinanceExport"
import type { BillingRecord } from "@/lib/types/financeBilling"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export type InvoicingReviewDeps = {
  save: (blob: Blob, filename: string) => void
  loadClientMeta?: () => Promise<FinanceExcelClientMetaLoad>
}

export function invoicingReviewFileStem(range: { from: string; to: string }): string {
  return `Clients_billing_${range.from}_${range.to}`
}

export function buildInvoicingReviewCsv(records: BillingRecord[]): string {
  return buildInvoiceLinesCsv(records)
}

/**
 * S14: marks the records Send to accounts would hold above plan, so the review
 * download says "Held above plan". One GET per month with unsent media rows.
 * A 404 means the switch billing_above_plan_hold is off: records come back
 * unchanged, so the files match the files without the switch.
 */
export async function markHeldAbovePlan(
  records: BillingRecord[],
  fetchImpl: typeof fetch = fetch
): Promise<BillingRecord[]> {
  const months = [
    ...new Set(
      records
        .filter((r) => r.billing_type === "media" && !r.exported_at)
        .map((r) => String(r.billing_month ?? "").trim())
        .filter(Boolean)
    ),
  ]
  const heldKeys = new Set<string>()
  for (const month of months) {
    const res = await fetchImpl(`/api/finance/billing/above-plan-reason?month=${encodeURIComponent(month)}`)
    if (res.status === 404) return records
    if (!res.ok) throw new Error(`Could not check invoices held above plan for ${month} (${res.status}).`)
    const body = (await res.json()) as { held?: Array<{ invoice_key: string }> }
    for (const h of body.held ?? []) heldKeys.add(h.invoice_key)
  }
  if (heldKeys.size === 0) return records
  return records.map((r) =>
    heldKeys.has(String(r.invoice_key ?? "").trim()) ? { ...r, held_above_plan: true } : r
  )
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
