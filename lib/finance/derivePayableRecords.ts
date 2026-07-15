import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import {
  computeCampaignFinancialsFromVersion,
  findScheduleMonthForCalendar,
} from "@/lib/finance/computeCampaignFinancialsFromVersion"
import {
  agencyOwedDeliveryMediaTotal,
  payablesFromDeliveryMonth,
} from "@/lib/finance/scheduleMonthFinanceExtract"
import type { PayableDeliveryExtract } from "@/lib/finance/payablesReport"
import { roundMoney2 } from "@/lib/format/money"

const U = "\u001f"

export type PayablePlanVersionInput = {
  id?: unknown
  deliverySchedule?: unknown
  delivery_schedule?: unknown
  billingSchedule?: unknown
  billing_schedule?: unknown
  mba_number?: unknown
  campaign_name?: unknown
  mp_campaignname?: unknown
  mp_client_name?: unknown
  client_name?: unknown
  clients_id?: unknown
  mp_clients_id?: unknown
  client_id?: unknown
  campaign_start_date?: unknown
  campaign_end_date?: unknown
  mp_campaigndates_start?: unknown
  mp_campaigndates_end?: unknown
}

type EnrichedLine = PayableDeliveryExtract & { clientName: string }

function agencyOwedTotal(rows: EnrichedLine[]): number {
  return roundMoney2(rows.filter((r) => !r.clientPaysForMedia).reduce((s, r) => s + r.amount, 0))
}

/**
 * Build synthetic `BillingRecord` rows (`billing_type: "payable"`) for the finance hub.
 *
 * Month amounts come from {@link computeCampaignFinancialsFromVersion} **delivery**
 * schedule (core) — never from billingSchedule. Client-pays lines are kept on the
 * record for UI but excluded from `total`.
 */
export function derivePayableRecordsForMonth(
  versions: PayablePlanVersionInput[],
  year: number,
  month: number
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const lines: EnrichedLine[] = []

  for (const version of versions) {
    const financials = computeCampaignFinancialsFromVersion(version as Record<string, unknown>)
    if (!financials) continue

    // Payables always use delivery (fallbacks in computeCampaignFinancialsFromVersion
    // may copy billing→delivery when delivery is empty — that is the core path’s choice).
    const coreDeliveryMonth = findScheduleMonthForCalendar(
      financials.deliverySchedule,
      year,
      month
    )
    if (!coreDeliveryMonth) continue

    const mba = String(version.mba_number ?? "").trim()
    const campaign =
      String(version.campaign_name ?? version.mp_campaignname ?? "").trim() || mba || "Campaign"
    const clientId =
      Number(version.clients_id ?? version.mp_clients_id ?? version.client_id ?? 0) || 0
    const clientName = String(version.mp_client_name ?? version.client_name ?? "Unknown client").trim()

    const extracted = payablesFromDeliveryMonth(coreDeliveryMonth, {
      mbaNumber: mba,
      clientId,
      campaignName: campaign,
    })

    // Dev-safety: agency owed from lines must match core delivery media (ex client-pays).
    if (process.env.NODE_ENV !== "production") {
      const fromLines = agencyOwedTotal(extracted.map((e) => ({ ...e, clientName })))
      const fromCore = agencyOwedDeliveryMediaTotal(coreDeliveryMonth)
      if (Math.abs(fromLines - fromCore) >= 0.01) {
        console.warn("[finance-derive-payables] agency owed drift vs core delivery month", {
          mba,
          fromLines,
          fromCore,
        })
      }
    }

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
