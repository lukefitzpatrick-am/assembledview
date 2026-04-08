import type { BillingLineItem, BillingRecord, BillingType } from "@/lib/types/financeBilling"
import { pickBillingLineItemMediaDetailsFromApiPayload } from "@/lib/finance/planLineItemEnrichment"

const RECEIVABLE_TYPES = new Set<BillingType>(["media", "sow", "retainer"])

function mapLineItems(raw: unknown): BillingLineItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).map((row, i) => {
    const li = row as BillingLineItem
    const o = row as Record<string, unknown>
    return {
      id: Number(li.id) || 0,
      finance_billing_records_id: Number(li.finance_billing_records_id) || 0,
      item_code: String(li.item_code ?? ""),
      line_type: li.line_type ?? "media",
      media_type: li.media_type ?? null,
      description: li.description ?? null,
      publisher_name: li.publisher_name ?? null,
      amount: Number(li.amount) || 0,
      client_pays_media: Boolean(li.client_pays_media),
      sort_order: Number(li.sort_order) ?? i,
      ...pickBillingLineItemMediaDetailsFromApiPayload(o),
    }
  })
}

/** Normalise a Xano `finance_billing_records` row for receivable billing types only. */
export function normalizeReceivableBillingRecord(raw: unknown): BillingRecord | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const bt = (o.billing_type ?? o.billingType) as string
  if (!RECEIVABLE_TYPES.has(bt as BillingType)) return null

  const lineRaw = o.line_items ?? o.lineItems
  const line_items = mapLineItems(lineRaw)

  return {
    id: Number(o.id) || 0,
    billing_type: bt as BillingType,
    clients_id: Number(o.clients_id ?? o.clientsId) || 0,
    client_name: String(o.client_name ?? o.clientName ?? ""),
    mba_number: o.mba_number != null ? String(o.mba_number) : o.mbaNumber != null ? String(o.mbaNumber) : null,
    campaign_name:
      o.campaign_name != null ? String(o.campaign_name) : o.campaignName != null ? String(o.campaignName) : null,
    po_number: o.po_number != null ? String(o.po_number) : o.poNumber != null ? String(o.poNumber) : null,
    billing_month: String(o.billing_month ?? o.billingMonth ?? ""),
    invoice_date: o.invoice_date != null ? String(o.invoice_date) : o.invoiceDate != null ? String(o.invoiceDate) : null,
    payment_days: Number(o.payment_days ?? o.paymentDays) || 0,
    payment_terms: String(o.payment_terms ?? o.paymentTerms ?? ""),
    status: (o.status as BillingRecord["status"]) ?? "booked",
    line_items,
    total: Number(o.total) || 0,
    has_pending_edits: Boolean(o.has_pending_edits ?? o.hasPendingEdits),
    source_billing_schedule_id:
      o.source_billing_schedule_id != null
        ? Number(o.source_billing_schedule_id)
        : o.sourceBillingScheduleId != null
          ? Number(o.sourceBillingScheduleId)
          : null,
  }
}
