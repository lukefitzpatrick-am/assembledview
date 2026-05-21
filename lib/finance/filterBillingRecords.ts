import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"

/**
 * Shared post-derive filters for finance hub list APIs (`GET /api/finance/billing`,
 * `GET /api/finance/payables`). Single source of truth for hub query-param filtering
 * after records are built from plans, scopes, or delivery schedules.
 */

/** Keep rows whose `clients_id` is in the comma-separated id list; empty input = no filter. */
export function filterByClients(rows: BillingRecord[], clientsIdCsv: string | null): BillingRecord[] {
  const ids = (clientsIdCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return rows
  const want = new Set(ids.map((s) => String(s)))
  return rows.filter((r) => want.has(String(r.clients_id)))
}

/** Case-insensitive substring match across client, campaign, status, and line item text. */
export function filterBySearch(rows: BillingRecord[], search: string | null): BillingRecord[] {
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

/** Keep rows whose `status` is in the comma-separated list; empty input = no filter. */
export function filterByStatuses(rows: BillingRecord[], statusCsv: string | null): BillingRecord[] {
  const parts = (statusCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return rows
  const want = new Set(parts)
  return rows.filter((r) => want.has(r.status))
}

/** Map publisher ids to names; retainer and SOW rows always pass when filter is active. */
export function filterByPublisherIds(
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

/** Keep rows whose `billing_type` is in `types`; empty `types` = no filter. */
export function filterByBillingTypes(rows: BillingRecord[], types: BillingType[]): BillingRecord[] {
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

/** Apply hub post-derive filters in billing-route order (used by payables route). */
export function applyHubBillingRecordFilters(
  rows: BillingRecord[],
  params: HubBillingRecordFilterParams,
  publisherIdMap: Map<number, string>
): BillingRecord[] {
  let merged = rows
  merged = filterByClients(merged, params.clientsIdCsv)
  merged = filterBySearch(merged, params.search)
  merged = filterByStatuses(merged, params.statusCsv)
  merged = filterByPublisherIds(merged, params.publishersIdCsv, publisherIdMap)
  merged = filterByBillingTypes(merged, params.billingTypes)
  return merged
}
