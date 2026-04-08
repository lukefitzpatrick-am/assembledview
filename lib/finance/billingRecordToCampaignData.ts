import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { FinanceCampaignData, FinanceLineItem, FinanceServiceRow } from "@/lib/finance/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function groupKey(r: BillingRecord): string {
  const mba = (r.mba_number ?? "").trim()
  return `${r.clients_id}\u001f${mba}`
}

function invoiceIsoForRecord(r: BillingRecord): string {
  const trimmed = r.invoice_date?.trim()
  if (trimmed) return trimmed
  if (r.billing_month) return `${r.billing_month}-01`
  return new Date().toISOString().slice(0, 10)
}

function lineItemsFromBillingLineItems(items: BillingLineItem[]): {
  lineItems: FinanceLineItem[]
  serviceRows: FinanceServiceRow[]
} {
  const lineItems: FinanceLineItem[] = []
  const serviceRows: FinanceServiceRow[] = []
  for (const li of items) {
    if (li.line_type === "media") {
      lineItems.push({
        itemCode: li.item_code,
        mediaType: li.media_type || "media",
        description: li.description || "",
        amount: li.amount,
      })
    } else if (li.line_type === "service" || li.line_type === "fee") {
      serviceRows.push({
        itemCode: li.item_code,
        service: li.description || li.media_type || li.line_type,
        amount: li.amount,
      })
    } else {
      serviceRows.push({
        itemCode: li.item_code,
        service: li.description || li.media_type || li.line_type,
        amount: li.amount,
      })
    }
  }
  return { lineItems, serviceRows }
}

function mergeGroupToFinanceCampaignData(group: BillingRecord[]): FinanceCampaignData {
  const sorted = [...group].sort((a, b) => a.id - b.id)
  const first = sorted[0]!
  const allLines = sorted.flatMap((r) => r.line_items || [])
  const { lineItems, serviceRows } = lineItemsFromBillingLineItems(allLines)
  const total = roundMoney(allLines.reduce((s, li) => s + Number(li.amount || 0), 0))

  const po = sorted.map((r) => r.po_number?.trim()).find(Boolean)

  return {
    clientName: first.client_name,
    mbaNumber: first.mba_number || "",
    poNumber: po || undefined,
    campaignName: first.campaign_name || "",
    paymentDays: first.payment_days,
    paymentTerms: first.payment_terms,
    invoiceDate: invoiceIsoForRecord(first),
    lineItems,
    serviceRows,
    total,
  }
}

/**
 * Group receivable-style billing rows by `(clients_id, mba_number)` and map each group to
 * {@link FinanceCampaignData} for media / scopes Excel writers.
 */
export function billingRecordsToFinanceCampaigns(records: BillingRecord[]): FinanceCampaignData[] {
  const groups = new Map<string, BillingRecord[]>()
  for (const r of records) {
    const k = groupKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const out = [...groups.values()].map(mergeGroupToFinanceCampaignData)
  out.sort((a, b) => {
    const c = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
    if (c !== 0) return c
    return a.mbaNumber.localeCompare(b.mbaNumber, undefined, { sensitivity: "base" })
  })
  return out
}
