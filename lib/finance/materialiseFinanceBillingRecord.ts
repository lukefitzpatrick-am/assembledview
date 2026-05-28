import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import type { BillingRecord } from "@/lib/types/financeBilling"

/**
 * Domain 5 Stage 2.2b — lazy materialisation of finance_billing_records rows.
 *
 * Returns the existing or newly-created record id for an invoice grain.
 * Used by Stage 3+ status writes (mark billed, set notes, etc.).
 *
 * Race-safe: relies on the UNIQUE index on invoice_key. POST attempts first;
 * if the unique constraint blocks (4xx), falls back to GET-by-invoice_key.
 */

export type MaterialiseParams = {
  billing_type: BillingRecord["billing_type"]
  clients_id: number
  client_name: string
  mba_number: string | null
  campaign_name: string | null
  billing_month: string
  // Used to seed total/status on first creation; the read overlay continues
  // to authoritative for these values from schedule JSON.
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

  // First, attempt a GET-by-key. Cheap when row already exists.
  try {
    const existing = await fetchByInvoiceKey(invoice_key)
    if (existing != null) return existing
  } catch (error) {
    console.error("[finance-materialise] GET by invoice_key failed; will attempt POST", {
      invoice_key,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  // Row not found — attempt POST.
  try {
    const url = xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")
    const response = await axios.post(url, {
      billing_type: params.billing_type,
      clients_id: params.clients_id,
      client_name: params.client_name,
      mba_number: params.mba_number ?? "",
      campaign_name: params.campaign_name ?? "",
      billing_month: params.billing_month,
      invoice_key,
      total: params.initial_total ?? 0,
      status: params.initial_status ?? "draft",
      payment_days: params.initial_payment_days ?? 30,
      payment_terms: params.initial_payment_terms ?? "Net 30 days",
      billed: false,
      has_pending_edits: false,
      // Stage 2.1 columns (default-empty)
      notes: "",
      billed_at: null,
      billed_by: null,
      exported_at: null,
      exported_by: null,
      // Existing columns we leave as default
      po_number: "",
      invoice_date: "",
      source_billing_schedule_id: 0,
    })
    const newId = Number(response.data?.id)
    if (Number.isFinite(newId) && newId > 0) return newId
    console.error("[finance-materialise] POST returned non-numeric id", { response: response.data })
    return null
  } catch (error) {
    // Race: another caller created the row between our GET and POST. Retry the GET.
    console.warn("[finance-materialise] POST failed; retrying GET by invoice_key", {
      invoice_key,
      message: error instanceof Error ? error.message : String(error),
    })
    try {
      const recovered = await fetchByInvoiceKey(invoice_key)
      if (recovered != null) return recovered
    } catch {
      // fall through
    }
    console.error("[finance-materialise] giving up", { invoice_key })
    return null
  }
}

async function fetchByInvoiceKey(invoice_key: string): Promise<number | null> {
  const url = xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")
  const response = await axios.get(url)
  const data = response.data
  const rows: Array<Record<string, unknown>> = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : []
  const match = rows.find((r) => r.invoice_key === invoice_key)
  if (!match) return null
  const id = Number(match.id)
  return Number.isFinite(id) && id > 0 ? id : null
}
