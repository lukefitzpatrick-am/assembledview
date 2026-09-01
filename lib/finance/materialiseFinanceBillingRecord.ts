import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { upsertFinanceBillingRecordByInvoiceKey } from "@/lib/data/writeFinance"

/**
 * Lazy materialisation of finance_billing_records rows in Postgres.
 * Returns the existing or newly-created record id for an invoice grain.
 * Keyed on invoice_key (UNIQUE). Never writes xero: rows.
 */

export type MaterialiseParams = {
  billing_type: BillingRecord["billing_type"]
  clients_id: number
  client_name: string
  mba_number: string | null
  campaign_name: string | null
  billing_month: string
  initial_total?: number
  initial_status?: BillingRecord["status"]
  initial_payment_days?: number
  initial_payment_terms?: string
}

/**
 * Returns the persisted finance_billing_records row id, creating it if
 * absent. Returns null when the invoice grain is not materialisable
 * (e.g. retainer with missing campaign name, or composeInvoiceKey returns null).
 */
export async function ensureFinanceBillingRecord(
  params: MaterialiseParams
): Promise<number | null> {
  const invoice_key = composeInvoiceKey(
    params.billing_type,
    params.clients_id,
    params.mba_number,
    params.campaign_name,
    params.billing_month
  )
  if (!invoice_key) {
    console.error("[finance-materialise] composeInvoiceKey returned null", params)
    return null
  }

  try {
    const row = await upsertFinanceBillingRecordByInvoiceKey(invoice_key, {
      billing_type: params.billing_type,
      clients_id: params.clients_id,
      client_name: params.client_name,
      mba_number: params.mba_number,
      campaign_name: params.campaign_name,
      billing_month: params.billing_month,
      initial_total: params.initial_total,
      initial_status: params.initial_status,
      initial_payment_days: params.initial_payment_days,
      initial_payment_terms: params.initial_payment_terms,
    })
    const newId = Number(row.id)
    if (Number.isFinite(newId) && newId > 0) return newId
    console.error("[finance-materialise] upsert returned non-numeric id", { row })
    return null
  } catch (error) {
    console.error("[finance-materialise] postgres upsert failed", {
      invoice_key,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
