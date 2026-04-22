import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import { formatInvoiceDate } from "@/lib/finance/utils"

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown): string {
  return String(v ?? "").trim()
}

/**
 * Build synthetic `billing_type: "retainer"` rows from clients for one billing month.
 * One row per client with a positive `monthlyretainer` (unless `includeZeroAmounts`).
 */
export function deriveRetainerBillingRecordsForMonth(
  clients: Record<string, unknown>[],
  year: number,
  month: number,
  options: { includeZeroAmounts?: boolean } = {}
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const includeZero = options.includeZeroAmounts === true
  const records: BillingRecord[] = []

  for (const c of clients) {
    const rawAmount = num(c.monthlyretainer, 0)
    const amount = Math.round(rawAmount * 100) / 100
    if (amount <= 0 && !includeZero) continue

    const clientName = str(c.clientname_input ?? c.mp_client_name ?? c.name)
    if (!clientName) continue

    const clients_id = num(c.id, 0)
    const payment_days = num(c.payment_days, 30) || 30
    const payment_terms = str(c.payment_terms) || "Net 30 days"
    const mbaRaw = c.mbaidentifier
    const mba_number = mbaRaw != null && String(mbaRaw).trim() !== "" ? String(mbaRaw).trim() : null

    const line_items: BillingLineItem[] = [
      {
        id: 0,
        finance_billing_records_id: 0,
        item_code: "Retainer",
        line_type: "retainer",
        media_type: "Retainer",
        description: "Monthly retainer",
        publisher_name: null,
        amount,
        client_pays_media: false,
        sort_order: 0,
      },
    ]

    records.push({
      id: 0,
      billing_type: "retainer",
      clients_id,
      client_name: clientName,
      mba_number,
      campaign_name: "Monthly retainer",
      po_number: null,
      billing_month: billingMonth,
      invoice_date: formatInvoiceDate(year, month),
      payment_days,
      payment_terms,
      status: "booked",
      line_items,
      total: amount,
      has_pending_edits: false,
      source_billing_schedule_id: null,
    })
  }

  records.sort((a, b) => a.client_name.localeCompare(b.client_name, "en-AU"))
  return records
}
