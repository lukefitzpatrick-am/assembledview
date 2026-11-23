import { toCents } from "@/lib/money"
import type { BillingRecord } from "@/lib/types/financeBilling"

/**
 * S12 A (switch `billing_compute_on_read`): a finance_billing_records amount is a
 * stored copy. It stands once the record is approved (the amount sent), sent to
 * accounts, matched to a Xero invoice or billed. Before that a reader takes a
 * media record's amount on read from the billing-month function
 * (`composeBillingRecordsForMonth`). SOW and retainer keep their stored copy.
 */
export function storedBillingStands(row: {
  approved_at: unknown
  exported_at: unknown
  matched_xero_invoice_id: unknown
  billed: unknown
}): boolean {
  const set = (v: unknown) => v != null && String(v).trim() !== ""
  return set(row.approved_at) || set(row.exported_at) || set(row.matched_xero_invoice_id) || row.billed === true
}

/** Lower-cased invoice_key: stored MBA numbers mix case. */
export const invoiceKeyOf = (key: string | null | undefined): string => String(key ?? "").trim().toLowerCase()

/** Integer cents per invoice_key from the billing-month function's records. A key the plan does not bill is absent. */
export function computedCentsByInvoiceKey(records: Pick<BillingRecord, "invoice_key" | "total">[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of records) {
    const key = invoiceKeyOf(r.invoice_key)
    if (!key || !Number.isFinite(r.total)) continue
    out.set(key, (out.get(key) ?? 0) + toCents(r.total))
  }
  return out
}
