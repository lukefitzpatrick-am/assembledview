import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import {
  extractPayablesFromDeliverySchedule,
  type PayableDeliveryExtract,
} from "@/lib/finance/payablesReport"

const U = "\u001f"

export type PayablePlanVersionInput = {
  id?: unknown
  deliverySchedule?: unknown
  delivery_schedule?: unknown
  mba_number?: unknown
  campaign_name?: unknown
  mp_campaignname?: unknown
  mp_client_name?: unknown
  client_name?: unknown
  clients_id?: unknown
  mp_clients_id?: unknown
  client_id?: unknown
}

function coalesceDeliveryJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  return raw
}

type EnrichedLine = PayableDeliveryExtract & { clientName: string }

function agencyOwedTotal(rows: EnrichedLine[]): number {
  return (
    Math.round(
      rows.filter((r) => !r.clientPaysForMedia).reduce((s, r) => s + r.amount, 0) * 100
    ) / 100
  )
}

/**
 * Build synthetic `BillingRecord` rows (`billing_type: "payable"`) for the finance hub.
 *
 * **Source of truth:** `media_plan_versions.deliverySchedule` / `delivery_schedule` only.
 * Receivables use `billingSchedule`; payables (publisher / delivery view) must not read
 * `billingSchedule` here — that would mix client billing with agency delivery.
 *
 * Groups by `clientId + publisherName + mbaNumber` so unrelated campaigns do not merge.
 */
export function derivePayableRecordsForMonth(
  versions: PayablePlanVersionInput[],
  year: number,
  month: number
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const lines: EnrichedLine[] = []

  for (const version of versions) {
    // Payables: delivery JSON only (never billingSchedule / billing_schedule).
    const ds = coalesceDeliveryJson(version.deliverySchedule ?? version.delivery_schedule)
    if (!ds) continue

    const mba = String(version.mba_number ?? "").trim()
    const campaign =
      String(version.campaign_name ?? version.mp_campaignname ?? "").trim() || mba || "Campaign"
    const clientId =
      Number(version.clients_id ?? version.mp_clients_id ?? version.client_id ?? 0) || 0
    const clientName = String(version.mp_client_name ?? version.client_name ?? "Unknown client").trim()

    const extracted = extractPayablesFromDeliverySchedule(ds, year, month, {
      mbaNumber: mba,
      clientId,
      campaignName: campaign,
    })

    for (const e of extracted) {
      lines.push({ ...e, clientName })
    }
  }

  const groupMap = new Map<string, EnrichedLine[]>()
  for (const line of lines) {
    const k = `${line.clientId}${U}${line.publisherName}${U}${line.mbaNumber}`
    if (!groupMap.has(k)) groupMap.set(k, [])
    groupMap.get(k)!.push(line)
  }

  const records: BillingRecord[] = []

  for (const [, rows] of groupMap) {
    if (rows.length === 0) continue
    const first = rows[0]!
    const total = agencyOwedTotal(rows)

    const line_items: BillingLineItem[] = rows.map((r, i) => {
      const mt = (r.mediaType || "MEDIA").toString().replace(/\s+/g, "").slice(0, 24)
      return {
        id: 0,
        finance_billing_records_id: 0,
        item_code: `PAY.${mt || "MEDIA"}`,
        line_type: "media",
        media_type: r.mediaType || null,
        description: r.description || r.campaignName || r.mediaType || null,
        publisher_name: r.publisherName,
        amount: r.amount,
        client_pays_media: r.clientPaysForMedia === true,
        sort_order: i,
      }
    })

    records.push({
      id: 0,
      billing_type: "payable",
      clients_id: first.clientId,
      client_name: first.clientName,
      mba_number: first.mbaNumber || null,
      campaign_name: first.campaignName || null,
      po_number: null,
      billing_month: billingMonth,
      invoice_date: null,
      payment_days: 0,
      payment_terms: "Net 30",
      status: "expected",
      line_items,
      total,
      has_pending_edits: false,
      // Payables come from deliverySchedule on the version, not billing schedule rows.
      source_billing_schedule_id: null,
    })
  }

  records.sort((a, b) => {
    const ca = `${a.client_name}|${a.mba_number}|${a.line_items[0]?.publisher_name ?? ""}`
    const cb = `${b.client_name}|${b.mba_number}|${b.line_items[0]?.publisher_name ?? ""}`
    return ca.localeCompare(cb, undefined, { sensitivity: "base" })
  })

  return records
}
