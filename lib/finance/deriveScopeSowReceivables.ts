import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import { formatInvoiceDate, type FinanceLineItem } from "@/lib/finance/utils"
import {
  extractLineItemsFromScopeCost,
  extractLineItemsFromScopeSchedule,
  parseScopeJSON,
} from "@/lib/finance/scopeScheduleExtract"

export type ScopeOfWorkRow = {
  id: number
  scope_id?: string
  client_name?: string
  project_name?: string
  project_status?: string
  payment_terms_and_conditions?: string
  billing_schedule?: unknown
  billingSchedule?: unknown
  cost?: unknown
}

function financeLineItemsToSowBillingLines(items: FinanceLineItem[]): BillingLineItem[] {
  return items.map((li, i) => ({
    id: 0,
    finance_billing_records_id: 0,
    item_code: li.itemCode,
    line_type: "media" as const,
    media_type: li.mediaType || null,
    description: li.description || null,
    publisher_name: li.publisherName ?? null,
    amount: li.amount,
    client_pays_media: false,
    sort_order: i,
  }))
}

function isScopeInBookedBucket(statusRaw: string | undefined): boolean {
  const status = (statusRaw || "").toLowerCase()
  return status === "approved" || status === "in-progress" || status === "in progress"
}

/**
 * Build synthetic `billing_type: "sow"` rows from scopes-of-work for one calendar month.
 */
export function deriveSowBillingRecordsFromScopes(
  scopes: ScopeOfWorkRow[],
  year: number,
  month: number,
  resolveClientId: (clientName: string) => number,
  options: { includeNonApprovedScopes: boolean }
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const records: BillingRecord[] = []

  for (const scope of scopes) {
    const inBooked = isScopeInBookedBucket(scope.project_status)
    if (!inBooked && !options.includeNonApprovedScopes) continue

    const billingSchedule = parseScopeJSON(scope.billingSchedule ?? scope.billing_schedule)
    const fromSchedule = extractLineItemsFromScopeSchedule(billingSchedule, year, month)
    const fromCost = extractLineItemsFromScopeCost(scope.cost)
    const lineFinance = fromSchedule.length > 0 ? fromSchedule : fromCost
    const total = Math.round(lineFinance.reduce((s, li) => s + li.amount, 0) * 100) / 100
    if (total <= 0) continue

    const clientName = scope.client_name?.trim() || "Unknown Client"
    const clients_id = resolveClientId(clientName)
    const mbaKey = String(scope.scope_id ?? scope.id ?? "SOW").trim()
    const line_items = financeLineItemsToSowBillingLines(lineFinance)

    records.push({
      id: 0,
      billing_type: "sow",
      clients_id,
      client_name: clientName,
      mba_number: mbaKey,
      campaign_name: scope.project_name?.trim() || "Scope of Work",
      po_number: null,
      billing_month: billingMonth,
      invoice_date: formatInvoiceDate(year, month),
      payment_days: 30,
      payment_terms: scope.payment_terms_and_conditions?.trim() || "Net 30 days",
      status: inBooked ? "booked" : "draft",
      line_items,
      total,
      has_pending_edits: false,
      source_billing_schedule_id: null,
    })
  }

  return records
}
