import type {
  BillingEdit,
  BillingLineItem,
  BillingRecord,
  FinanceFilters,
  SavedView,
} from "@/lib/types/financeBilling"

function toQuery(filters: FinanceFilters) {
  const params = new URLSearchParams()
  params.set(
    "billing_month",
    filters.monthRange.from === filters.monthRange.to
      ? filters.monthRange.from
      : `${filters.monthRange.from},${filters.monthRange.to}`
  )
  if (filters.selectedClients.length) params.set("clients_id", filters.selectedClients.join(","))
  if (filters.billingTypes.length) params.set("billing_type", filters.billingTypes.join(","))
  if (filters.statuses.length) params.set("status", filters.statuses.join(","))
  if (filters.searchQuery.trim()) params.set("search", filters.searchQuery.trim())
  return params.toString()
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || `Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export async function fetchBillingRecords(filters: FinanceFilters): Promise<BillingRecord[]> {
  const response = await fetch(`/api/finance/billing?${toQuery(filters)}`)
  const payload = await jsonOrThrow<{ records?: BillingRecord[] } | BillingRecord[]>(response)
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload.records) ? payload.records : []
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
  return jsonOrThrow<BillingRecord>(response)
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
  return jsonOrThrow<BillingLineItem>(response)
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
  return jsonOrThrow<BillingLineItem>(response)
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
  const response = await fetch(`/api/finance/edits?finance_billing_records_id=${recordId}`)
  const payload = await jsonOrThrow<{ edits?: BillingEdit[] } | BillingEdit[]>(response)
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload.edits) ? payload.edits : []
}

export async function fetchSavedViews(): Promise<SavedView[]> {
  const response = await fetch("/api/finance/saved-views")
  return jsonOrThrow<SavedView[]>(response)
}

export async function saveSavedView(view: Omit<SavedView, "id">): Promise<SavedView> {
  const response = await fetch("/api/finance/saved-views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view),
  })
  return jsonOrThrow<SavedView>(response)
}
