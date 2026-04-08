import { parseXanoListPayload } from "@/lib/api/xano"
import { expandMonthRange } from "@/lib/finance/monthRange"
import type {
  BillingEdit,
  BillingLineItem,
  BillingRecord,
  BillingType,
  FinanceFilters,
  SavedView,
} from "@/lib/types/financeBilling"

export type FinanceBillingQuery = {
  billing_month: string
  clients_id?: string
  publishers_id?: string
  /** When `false`, request sets `include_drafts=0`. Omit or `true` leaves drafts inclusion to API default. */
  include_drafts?: boolean
  billing_type?: string
  status?: string
  search?: string
}

function toQuery(filters: FinanceFilters, month: string, allowedTypes?: BillingType[]) {
  const params = new URLSearchParams()
  params.set("billing_month", month)
  if (filters.selectedClients.length) params.set("clients_id", filters.selectedClients.join(","))
  if (filters.selectedPublishers.length) params.set("publishers_id", filters.selectedPublishers.join(","))
  if (filters.includeDrafts === false) params.set("include_drafts", "0")
  if (allowedTypes?.length && filters.billingTypes.length) {
    const allowed = new Set(allowedTypes)
    const intersection = filters.billingTypes.filter((t) => allowed.has(t))
    if (intersection.length) params.set("billing_type", intersection.join(","))
  }
  if (filters.statuses.length) params.set("status", filters.statuses.join(","))
  if (filters.searchQuery.trim()) params.set("search", filters.searchQuery.trim())
  return params.toString()
}

function dedupeBillingRecordsById(records: BillingRecord[]): BillingRecord[] {
  const byId = new Map<number, BillingRecord>()
  for (const r of records) {
    if (!byId.has(r.id)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

function filtersToReceivableBillingParams(
  filters: FinanceFilters,
  allowedTypes: BillingType[]
): Omit<FinanceBillingQuery, "billing_month"> {
  const params: Omit<FinanceBillingQuery, "billing_month"> = {}
  if (filters.selectedClients.length) params.clients_id = filters.selectedClients.join(",")
  if (filters.selectedPublishers.length) params.publishers_id = filters.selectedPublishers.join(",")
  if (filters.includeDrafts === false) params.include_drafts = false
  if (filters.billingTypes.length) {
    const allowed = new Set(allowedTypes)
    const intersection = filters.billingTypes.filter((t) => allowed.has(t))
    if (intersection.length) params.billing_type = intersection.join(",")
  }
  if (filters.statuses.length) params.status = filters.statuses.join(",")
  const q = filters.searchQuery.trim()
  if (q) params.search = q
  return params
}

function recordsFromPayload(payload: { records?: BillingRecord[] } | BillingRecord[]): BillingRecord[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.records)) return payload.records
  return parseXanoListPayload(payload) as BillingRecord[]
}

/**
 * Thrown for non-OK fetch responses. `message` is always `[${status}] ${detail}` for console clarity.
 */
export class FinanceHttpError extends Error {
  readonly status: number
  readonly requestUrl: string
  readonly field?: string

  constructor(status: number, detail: string, requestUrl: string, field?: string) {
    super(`[${status}] ${detail}`)
    this.name = "FinanceHttpError"
    this.status = status
    this.requestUrl = requestUrl
    this.field = field
  }
}

function absoluteRequestUrl(pathOrUrl: string): string {
  if (typeof window === "undefined") return pathOrUrl
  try {
    return new URL(pathOrUrl, window.location.href).href
  } catch {
    return pathOrUrl
  }
}

async function jsonOrThrow<T>(response: Response, pathForUrl: string): Promise<T> {
  const requestUrl = absoluteRequestUrl(pathForUrl)
  if (!response.ok) {
    const status = response.status
    const raw = await response.text()
    const trimmed = raw.trim()
    let detail = trimmed.length > 0 ? trimmed : "Request failed"
    let field: string | undefined
    try {
      const j = JSON.parse(raw) as { error?: unknown; field?: unknown }
      if (j && typeof j === "object" && typeof j.error === "string") {
        field = typeof j.field === "string" ? j.field : undefined
        detail = `${j.error}${field ? ` (${field})` : ""}`
      }
    } catch {
      // keep detail as raw body text
    }
    throw new FinanceHttpError(status, detail, requestUrl, field)
  }
  return (await response.json()) as T
}

export async function fetchFinanceBilling(q: FinanceBillingQuery): Promise<BillingRecord[]> {
  const params = new URLSearchParams()
  params.set("billing_month", q.billing_month)
  if (q.clients_id) params.set("clients_id", q.clients_id)
  if (q.publishers_id) params.set("publishers_id", q.publishers_id)
  if (q.include_drafts === false) params.set("include_drafts", "0")
  if (q.billing_type) params.set("billing_type", q.billing_type)
  if (q.status) params.set("status", q.status)
  if (q.search) params.set("search", q.search)
  const path = `/api/finance/billing?${params.toString()}`
  const response = await fetch(path)
  const payload = await jsonOrThrow<{ records?: BillingRecord[] } | BillingRecord[]>(response, path)
  return recordsFromPayload(payload)
}

export async function fetchFinanceBillingForMonths(
  months: string[],
  params: Omit<FinanceBillingQuery, "billing_month"> = {}
): Promise<BillingRecord[]> {
  const results = await Promise.all(
    months.map((m) => fetchFinanceBilling({ ...params, billing_month: m }).catch(() => []))
  )
  const seen = new Set<string>()
  const out: BillingRecord[] = []
  for (const rec of results.flat()) {
    const key = rec.id
      ? `id:${rec.id}`
      : `${rec.clients_id}|${rec.mba_number ?? ""}|${rec.billing_type}|${rec.billing_month}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rec)
  }
  return out
}

export async function fetchFinancePayable(q: FinanceBillingQuery): Promise<BillingRecord[]> {
  const params = new URLSearchParams()
  params.set("billing_month", q.billing_month)
  if (q.clients_id) params.set("clients_id", q.clients_id)
  if (q.publishers_id) params.set("publishers_id", q.publishers_id)
  if (q.include_drafts === false) params.set("include_drafts", "0")
  if (q.billing_type) params.set("billing_type", q.billing_type)
  if (q.status) params.set("status", q.status)
  if (q.search) params.set("search", q.search)
  const path = `/api/finance/payables?${params.toString()}`
  const response = await fetch(path)
  const payload = await jsonOrThrow<{ records?: BillingRecord[] } | BillingRecord[]>(response, path)
  return recordsFromPayload(payload)
}

export async function fetchFinancePayablesForMonths(
  months: string[],
  params: Omit<FinanceBillingQuery, "billing_month"> = {}
): Promise<BillingRecord[]> {
  const results = await Promise.all(
    months.map((m) => fetchFinancePayable({ ...params, billing_month: m }).catch(() => []))
  )
  const seen = new Set<string>()
  const out: BillingRecord[] = []
  for (const rec of results.flat()) {
    const key = rec.id
      ? `id:${rec.id}`
      : `${rec.clients_id}|${rec.mba_number ?? ""}|${rec.billing_type}|${rec.billing_month}|${rec.line_items?.[0]?.publisher_name ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rec)
  }
  return out
}

export async function fetchBillingRecords(filters: FinanceFilters): Promise<BillingRecord[]> {
  const months = expandMonthRange(filters.monthRange)
  if (months.length === 0) return []
  const billingAllowed: BillingType[] = ["media", "sow", "retainer"]
  const baseParams = filtersToReceivableBillingParams(filters, billingAllowed)
  return fetchFinanceBillingForMonths(months, baseParams)
}

function filtersToPayablesParams(filters: FinanceFilters): Omit<FinanceBillingQuery, "billing_month"> {
  return filtersToReceivableBillingParams(filters, ["payable"])
}

/** Payables rebuild/merge from plan delivery schedules; one request per month (single `billing_month`), same filter fields as billing. */
export async function fetchPayablesRecords(filters: FinanceFilters): Promise<BillingRecord[]> {
  const months = expandMonthRange(filters.monthRange)
  if (months.length === 0) return []
  const params = filtersToPayablesParams(filters)
  return fetchFinancePayablesForMonths(months, params)
}

export async function fetchFinanceEditsList(): Promise<unknown[]> {
  const response = await fetch("/api/finance/edits", { cache: "no-store" })
  if (!response.ok) return []
  const data = (await response.json()) as unknown
  return Array.isArray(data) ? data : []
}

/** Persist accrual reconciliation via `finance_edits` (`record_type: accrual_reconcile`). */
export async function postAccrualReconcileEdit(params: {
  clients_id: number
  month: string
  reconciled: boolean
}): Promise<void> {
  const response = await fetch("/api/finance/edits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      record_type: "accrual_reconcile",
      edit_type: "field_change",
      field_name: `accrual:${params.clients_id}:${params.month}`,
      new_value: params.reconciled ? "1" : "0",
      old_value: null,
      edit_status: "published",
      finance_billing_records_id: null,
      finance_billing_line_items_id: null,
    }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
}

export async function updateBillingRecord(
  id: number,
  data: Partial<BillingRecord>
): Promise<BillingRecord> {
  const response = await fetch(`/api/finance/billing/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return jsonOrThrow<BillingRecord>(response, `/api/finance/billing/${id}`)
}

export async function updateLineItem(
  id: number,
  data: Partial<BillingLineItem>
): Promise<BillingLineItem> {
  const response = await fetch(`/api/finance/billing/line-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return jsonOrThrow<BillingLineItem>(response, `/api/finance/billing/line-items/${id}`)
}

export async function addLineItem(
  recordId: number,
  data: Omit<BillingLineItem, "id">
): Promise<BillingLineItem> {
  const response = await fetch("/api/finance/billing/line-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      finance_billing_records_id: recordId,
    }),
  })
  return jsonOrThrow<BillingLineItem>(response, "/api/finance/billing/line-items")
}

export async function deleteLineItem(id: number): Promise<void> {
  const response = await fetch(`/api/finance/billing/line-items/${id}`, { method: "DELETE" })
  if (!response.ok) {
    throw new Error(await response.text())
  }
}

export async function publishEdits(recordId: number): Promise<void> {
  const response = await fetch("/api/finance/edits/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finance_billing_records_id: recordId }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
}

export async function fetchEditHistory(recordId: number): Promise<BillingEdit[]> {
  const path = `/api/finance/edits?finance_billing_records_id=${recordId}`
  const response = await fetch(path)
  const payload = await jsonOrThrow<{ edits?: BillingEdit[] } | BillingEdit[]>(response, path)
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload.edits) ? payload.edits : []
}

export async function fetchSavedViews(): Promise<SavedView[]> {
  const response = await fetch("/api/finance/saved-views")
  return jsonOrThrow<SavedView[]>(response, "/api/finance/saved-views")
}

export async function saveSavedView(view: Omit<SavedView, "id">): Promise<SavedView> {
  const response = await fetch("/api/finance/saved-views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view),
  })
  return jsonOrThrow<SavedView>(response, "/api/finance/saved-views")
}
