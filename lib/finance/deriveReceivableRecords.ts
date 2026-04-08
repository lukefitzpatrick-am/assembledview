import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import {
  buildPlanLineItemMediaDetailLookup,
  compactMediaDetailSlice,
  lookupMediaDetailSlice,
  type PlanLineItemMediaDetailLookup,
} from "@/lib/finance/planLineItemEnrichment"
import {
  extractLineItemsFromBillingSchedule,
  extractServiceAmountsFromBillingSchedule,
  formatInvoiceDate,
  getMediaTypeKeyFromDisplayName,
  mergeFinanceLineItems,
  type FinanceLineItem,
} from "@/lib/finance/utils"

function financeMediaLineToBillingLine(
  li: FinanceLineItem,
  idx: number,
  lookup: PlanLineItemMediaDetailLookup
): BillingLineItem {
  const mediaKey = getMediaTypeKeyFromDisplayName(li.mediaType)
  const slice = lookupMediaDetailSlice(lookup, mediaKey, li.planLineItemId ?? null)
  const extras = slice ? compactMediaDetailSlice(slice) : {}
  return {
    id: 0,
    finance_billing_records_id: 0,
    item_code: li.itemCode,
    line_type: "media",
    media_type: li.mediaType || null,
    description: li.description || null,
    publisher_name: li.publisherName?.trim() || null,
    amount: li.amount,
    client_pays_media: false,
    sort_order: idx,
    ...extras,
  }
}

function buildClientResolution(
  version: Record<string, unknown>,
  clientMap: Map<string, unknown>
): { clients_id: number; client_name: string } {
  const numeric =
    Number(version.clients_id ?? version.mp_clients_id ?? version.client_id ?? 0) || 0
  const clientName = String(
    version.mp_client_name ?? version.client_name ?? version.campaign_name ?? "Unknown"
  ).trim()
  if (numeric) return { clients_id: numeric, client_name: clientName || "Unknown" }
  const rec = (clientName ? clientMap.get(clientName) : undefined) as Record<string, unknown> | undefined
  const id = rec?.id != null ? Number(rec.id) || 0 : 0
  return { clients_id: id, client_name: clientName || "Unknown" }
}

/**
 * Synthetic receivable rows from `media_plan_versions.billingSchedule` for one calendar month
 * (aligned with `/api/finance/data` extraction).
 */
export function derivePlanReceivableBillingRecordsForMonth(
  relevantVersions: Record<string, unknown>[],
  year: number,
  month: number,
  publisherMap: Map<string, unknown>,
  clientMap: Map<string, unknown>,
  options: { includeNonBookedCampaigns: boolean }
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const out: BillingRecord[] = []

  for (const version of relevantVersions) {
    const status = String(version.campaign_status ?? "").toLowerCase()
    const bookedLike =
      status === "booked" || status === "approved" || status === "completed"
    if (!bookedLike && !options.includeNonBookedCampaigns) continue

    let billingSchedule: unknown = null
    const raw = version.billingSchedule ?? version.billing_schedule
    if (raw) {
      try {
        billingSchedule = typeof raw === "string" ? JSON.parse(raw as string) : raw
      } catch {
        billingSchedule = null
      }
    }

    const { clients_id, client_name } = buildClientResolution(version, clientMap)
    const mba = String(version.mba_number ?? "").trim()
    const campaign = String(version.campaign_name ?? "").trim() || mba || "Campaign"

    const planLookup = buildPlanLineItemMediaDetailLookup(version as Record<string, unknown>)

    const financeMediaLines = mergeFinanceLineItems(
      extractLineItemsFromBillingSchedule(billingSchedule, year, month, publisherMap as Map<string, any>)
    )
    const serviceAmounts = extractServiceAmountsFromBillingSchedule(billingSchedule, year, month)

    const totalLineItemsAmount = financeMediaLines.reduce((s, li) => s + li.amount, 0)
    const totalServicesAmount =
      serviceAmounts.adservingTechFees + serviceAmounts.production + serviceAmounts.assembledFee
    if (totalLineItemsAmount + totalServicesAmount <= 0) continue

    const clientRow = (client_name ? clientMap.get(client_name) : undefined) as Record<string, unknown> | undefined
    const paymentDays = Number(clientRow?.payment_days) || 30
    const paymentTerms = String(clientRow?.payment_terms ?? "Net 30 days")

    const invoiceDate = formatInvoiceDate(year, month)
    const recordStatus: BillingRecord["status"] =
      status === "completed" ? "booked"
      : status === "approved" ? "booked"
      : status === "booked" ? "booked"
      : "draft"

    if (financeMediaLines.length > 0) {
      const line_items = financeMediaLines.map((li, i) => financeMediaLineToBillingLine(li, i, planLookup))
      const mediaTotal = Math.round(line_items.reduce((s, li) => s + li.amount, 0) * 100) / 100
      out.push({
        id: 0,
        billing_type: "media",
        clients_id,
        client_name,
        mba_number: mba || null,
        campaign_name: campaign,
        po_number: version.po_number != null ? String(version.po_number) : null,
        billing_month: billingMonth,
        invoice_date: invoiceDate,
        payment_days: paymentDays,
        payment_terms: paymentTerms,
        status: recordStatus,
        line_items,
        total: mediaTotal,
        has_pending_edits: false,
        source_billing_schedule_id: null,
      })
    }

    const hasAA = financeMediaLines.some((li) => li.itemCode.startsWith("G."))
    const hasAM = financeMediaLines.some((li) => li.itemCode.startsWith("D."))

    const feeLines: BillingLineItem[] = []
    let order = 0
    const pushFee = (item_code: string, description: string, amount: number) => {
      if (amount <= 0) return
      feeLines.push({
        id: 0,
        finance_billing_records_id: 0,
        item_code,
        line_type: "service",
        media_type: null,
        description,
        publisher_name: null,
        amount: Math.round(amount * 100) / 100,
        client_pays_media: false,
        sort_order: order++,
      })
    }

    pushFee("T.Adserving", "Adserving and Tech Fees", serviceAmounts.adservingTechFees)
    if (hasAA) pushFee("G.Production", "Production", serviceAmounts.production)
    if (hasAM) pushFee("D.Production", "Production", serviceAmounts.production)
    pushFee("Service", "Assembled Fee", serviceAmounts.assembledFee)

    if (feeLines.length > 0) {
      const feesTotal = Math.round(feeLines.reduce((s, li) => s + li.amount, 0) * 100) / 100
      out.push({
        id: 0,
        billing_type: "sow",
        clients_id,
        client_name,
        mba_number: mba || null,
        campaign_name: campaign,
        po_number: version.po_number != null ? String(version.po_number) : null,
        billing_month: billingMonth,
        invoice_date: invoiceDate,
        payment_days: paymentDays,
        payment_terms: paymentTerms,
        status: recordStatus,
        line_items: feeLines,
        total: feesTotal,
        has_pending_edits: false,
        source_billing_schedule_id: null,
      })
    }
  }

  return out
}

/**
 * Stable merge key: one persisted or synthetic row per client × MBA × billing type.
 * Retainers often share empty MBA; disambiguate with campaign + id when present.
 */
export function receivableMergeKey(r: BillingRecord): string {
  const mba = (r.mba_number ?? "").trim()
  if (r.billing_type === "retainer") {
    const camp = (r.campaign_name ?? "").trim()
    return `${r.clients_id}\u001f${mba}\u001fretainer\u001f${camp}\u001f${r.id}`
  }
  return `${r.clients_id}\u001f${mba}\u001f${r.billing_type}`
}
