import { FinanceHttpError } from "@/lib/finance/api"
import type {
  DeliveryPacingRow,
  LineItemPacingDailyPoint,
  LineItemPacingRow,
  PacingAlert,
  PacingAlertSubscription,
  PacingAlertSubscriptionInput,
  PacingItemResponse,
  PacingListResponse,
  PacingMapping,
  PacingMappingInput,
  PacingSavedView,
  PacingSavedViewInput,
  PacingTestMatchRequest,
  PacingTestMatchResponse,
  PacingTestMatchRow,
  SearchMappingNoRecentDeliveryRow,
  PacingThreshold,
  PacingThresholdUpsertInput,
} from "@/lib/xano/pacing-types"

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
      const j = JSON.parse(raw) as { error?: unknown; field?: unknown; reason?: unknown }
      if (j && typeof j === "object" && typeof j.error === "string") {
        field = typeof j.field === "string" ? j.field : undefined
        const reason = typeof j.reason === "string" ? j.reason : undefined
        detail = `${j.error}${field ? ` (${field})` : ""}${reason ? ` [${reason}]` : ""}`
      }
    } catch {
      // keep text
    }
    throw new FinanceHttpError(status, detail, requestUrl, field)
  }
  return (await response.json()) as T
}

function searchParamsFromRecord(r: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(r)) {
    if (v === undefined || v === null || v === "") continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** Snowflake-backed */
export async function fetchPacingLineItems(params: {
  /** Comma-separated Xano client ids (multi-filter). Omit for “all in scope”. */
  clients_id?: string
  media_type?: string
  status?: string
  date_from?: string
  date_to?: string
  search?: string
  /** Media plan version id (Xano) — optional narrow filter. */
  media_plan_id?: number
}): Promise<PacingListResponse<LineItemPacingRow>> {
  const path = `/api/pacing/line-items${searchParamsFromRecord(params)}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function fetchPacingLineItemHistory(
  avLineItemId: string,
  params?: { days?: number }
): Promise<PacingListResponse<LineItemPacingDailyPoint>> {
  const q =
    params?.days !== undefined
      ? searchParamsFromRecord({ days: params.days })
      : ""
  const enc = encodeURIComponent(avLineItemId)
  const path = `/api/pacing/line-items/${enc}/history${q}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function fetchPacingLineItemHistoryBatch(body: {
  av_line_item_ids: string[]
  days?: number
}): Promise<{ data: Record<string, LineItemPacingDailyPoint[]> }> {
  const path = "/api/pacing/line-items/history/batch"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      av_line_item_ids: body.av_line_item_ids,
      days: body.days ?? 14,
    }),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function fetchPacingDelivery(params: {
  av_line_item_id: string
  platform?: string
  group_type?: string
}): Promise<PacingListResponse<DeliveryPacingRow>> {
  const path = `/api/pacing/delivery${searchParamsFromRecord(params)}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function fetchPacingAlertsList(params: {
  clients_id?: string
  severity?: string
  media_type?: string
}): Promise<PacingListResponse<PacingAlert>> {
  const path = `/api/pacing/alerts${searchParamsFromRecord(params)}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function postPacingTestMatch(
  body: PacingTestMatchRequest
): Promise<PacingItemResponse<PacingTestMatchResponse>> {
  const path = "/api/pacing/mappings/test-match"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

/** Xano-backed (via Next proxy) */
export async function fetchPacingMappings(params?: {
  clients_id?: number
  media_type?: string
  platform?: string
  is_active?: boolean
}): Promise<PacingListResponse<PacingMapping>> {
  const path = `/api/pacing/mappings${searchParamsFromRecord(
    params
      ? {
          clients_id: params.clients_id,
          media_type: params.media_type,
          platform: params.platform,
          is_active:
            params.is_active === undefined ? undefined : params.is_active ? "true" : "false",
        }
      : {}
  )}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function createPacingMapping(body: PacingMappingInput): Promise<unknown> {
  const path = "/api/pacing/mappings"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function fetchPacingMapping(id: number): Promise<PacingItemResponse<PacingMapping>> {
  const path = `/api/pacing/mappings/${id}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function updatePacingMapping(
  id: number,
  body: Partial<PacingMappingInput>
): Promise<unknown> {
  const path = `/api/pacing/mappings/${id}`
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function deletePacingMapping(id: number): Promise<{ ok: boolean }> {
  const path = `/api/pacing/mappings/${id}`
  const res = await fetch(path, { method: "DELETE", cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function fetchPacingThresholds(params?: {
  clients_id?: number
}): Promise<PacingListResponse<PacingThreshold>> {
  const path = `/api/pacing/thresholds${searchParamsFromRecord(params ?? {})}`
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function upsertPacingThresholds(body: PacingThresholdUpsertInput): Promise<unknown> {
  const path = "/api/pacing/thresholds"
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function fetchPacingSavedViews(): Promise<PacingListResponse<PacingSavedView>> {
  const path = "/api/pacing/saved-views"
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function createPacingSavedView(body: PacingSavedViewInput): Promise<unknown> {
  const path = "/api/pacing/saved-views"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function updatePacingSavedView(
  id: number,
  body: Partial<PacingSavedViewInput>
): Promise<unknown> {
  const path = `/api/pacing/saved-views/${id}`
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function deletePacingSavedView(id: number): Promise<{ ok: boolean }> {
  const path = `/api/pacing/saved-views/${id}`
  const res = await fetch(path, { method: "DELETE", cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function setDefaultPacingSavedView(id: number): Promise<unknown> {
  const path = `/api/pacing/saved-views/${id}/set-default`
  const res = await fetch(path, { method: "POST", cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function fetchPacingAlertSubscriptions(): Promise<
  PacingListResponse<PacingAlertSubscription>
> {
  const path = "/api/pacing/alert-subscriptions"
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function createPacingAlertSubscription(
  body: PacingAlertSubscriptionInput
): Promise<unknown> {
  const path = "/api/pacing/alert-subscriptions"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function updatePacingAlertSubscription(
  id: number,
  body: Partial<PacingAlertSubscriptionInput>
): Promise<unknown> {
  const path = `/api/pacing/alert-subscriptions/${id}`
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return jsonOrThrow(res, path)
}

export async function deletePacingAlertSubscription(id: number): Promise<{ ok: boolean }> {
  const path = `/api/pacing/alert-subscriptions/${id}`
  const res = await fetch(path, { method: "DELETE", cache: "no-store" })
  return jsonOrThrow(res, path)
}

/** Admin-only: full DIM reload from Xano + dynamic table refresh. */
export async function postResyncPacingMappingsToSnowflake(): Promise<{
  inserted: number
  updated: number
  deleted: number
}> {
  const path = "/api/pacing/mappings/resync"
  const res = await fetch(path, { method: "POST", cache: "no-store" })
  return jsonOrThrow(res, path)
}

export type SearchContainerPacingSyncCounts = {
  created: number
  updated: number
  deactivated: number
  dry_run?: boolean
}

/**
 * Upsert pacing_mappings from Xano media_plan_search (suffix_id / google_ads / search).
 * Omit body for full sync (admin) or tenant-visible clients only when scoped.
 */
export async function fetchSearchMappingsNoRecentDelivery(): Promise<
  PacingListResponse<SearchMappingNoRecentDeliveryRow>
> {
  const path = "/api/pacing/search-mappings-no-recent-delivery"
  const res = await fetch(path, { cache: "no-store" })
  return jsonOrThrow(res, path)
}

export async function postSyncPacingFromSearchContainers(body?: {
  clients_id?: number
  media_plan_version_id?: number
  dry_run?: boolean
}): Promise<SearchContainerPacingSyncCounts> {
  const path = "/api/pacing/mappings/sync-from-search-containers"
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  })
  const payload = await jsonOrThrow<{ data: SearchContainerPacingSyncCounts }>(res, path)
  return payload.data
}
