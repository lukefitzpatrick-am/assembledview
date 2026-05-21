import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"

export function filterBillingRecordsByClients(
  rows: BillingRecord[],
  clientsIdCsv: string | null
): BillingRecord[] {
  const ids = (clientsIdCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return rows
  const want = new Set(ids.map((s) => String(s)))
  return rows.filter((r) => want.has(String(r.clients_id)))
}

export function filterBillingRecordsBySearch(
  rows: BillingRecord[],
  search: string | null
): BillingRecord[] {
  const q = (search || "").trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => {
    const hay = [
      r.client_name,
      r.mba_number,
      r.campaign_name,
      r.billing_month,
      r.status,
      ...r.line_items.map((li) => [li.publisher_name, li.media_type, li.description].join(" ")),
    ]
      .join(" ")
      .toLowerCase()
    return hay.includes(q)
  })
}

export function filterBillingRecordsByStatuses(
  rows: BillingRecord[],
  statusCsv: string | null
): BillingRecord[] {
  const parts = (statusCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return rows
  const want = new Set(parts)
  return rows.filter((r) => want.has(r.status))
}

export function filterBillingRecordsByPublisherIds(
  rows: BillingRecord[],
  publisherIdsCsv: string | null,
  publisherIdMap: Map<number, string>
): BillingRecord[] {
  const rawIds = (publisherIdsCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  if (rawIds.length === 0) return rows
  const want = new Set(
    rawIds.map((id) => (publisherIdMap.get(id) || "").trim()).filter(Boolean)
  )
  if (want.size === 0) return rows
  return rows.filter((r) => {
    if (r.billing_type === "retainer" || r.billing_type === "sow") return true
    return r.line_items.some((li) => {
      const n = (li.publisher_name || "").trim()
      return n && want.has(n)
    })
  })
}

export function filterBillingRecordsByBillingTypes(
  rows: BillingRecord[],
  types: BillingType[]
): BillingRecord[] {
  if (types.length === 0) return rows
  const want = new Set(types)
  return rows.filter((r) => want.has(r.billing_type))
}

/** When `includeNonBooked` is false, keep only booked/approved/completed campaign versions. */
export function filterPlanVersionsByIncludeDrafts(
  versions: Record<string, unknown>[],
  includeNonBooked: boolean
): Record<string, unknown>[] {
  if (includeNonBooked) return versions
  return versions.filter((version) => {
    const status = String(version.campaign_status ?? "").toLowerCase()
    return status === "booked" || status === "approved" || status === "completed"
  })
}

export type HubBillingRecordFilterParams = {
  clientsIdCsv: string | null
  search: string | null
  statusCsv: string | null
  publishersIdCsv: string | null
  billingTypes: BillingType[]
}

export function applyHubBillingRecordFilters(
  rows: BillingRecord[],
  params: HubBillingRecordFilterParams,
  publisherIdMap: Map<number, string>
): BillingRecord[] {
  let out = rows
  out = filterBillingRecordsByClients(out, params.clientsIdCsv)
  out = filterBillingRecordsBySearch(out, params.search)
  out = filterBillingRecordsByStatuses(out, params.statusCsv)
  out = filterBillingRecordsByPublisherIds(out, params.publishersIdCsv, publisherIdMap)
  out = filterBillingRecordsByBillingTypes(out, params.billingTypes)
  return out
}
