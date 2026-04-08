import type { PacingStatus } from "@/lib/xano/pacing-types"

export const PACING_MEDIA_TYPE_OPTIONS = [
  { value: "search", label: "Search" },
  { value: "social", label: "Social" },
  { value: "display", label: "Display" },
  { value: "bvod", label: "BVOD" },
  { value: "direct", label: "Direct" },
] as const

export const PACING_STATUS_OPTIONS: { value: PacingStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "slightly_under", label: "Slightly under" },
  { value: "under_pacing", label: "Under pacing" },
  { value: "slightly_over", label: "Slightly over" },
  { value: "over_pacing", label: "Over pacing" },
  { value: "no_delivery", label: "No delivery" },
  { value: "completed", label: "Completed" },
]

/** Persisted in Xano `pacing_saved_views.filters_json`. */
export type PacingFiltersSnapshot = {
  client_ids: string[]
  media_types: string[]
  statuses: string[]
  date_from: string
  date_to: string
  search: string
}

export const ALL_MY_CLIENTS_VALUE = "__all_my_clients__"

export function snapshotFromFilters(s: PacingFiltersSnapshot): Record<string, unknown> {
  return { ...s }
}

export function cloneFiltersSnapshot(s: PacingFiltersSnapshot): PacingFiltersSnapshot {
  return {
    client_ids: [...s.client_ids],
    media_types: [...s.media_types],
    statuses: [...s.statuses],
    date_from: s.date_from,
    date_to: s.date_to,
    search: s.search,
  }
}

export function lineItemsApiParamsFromSnapshot(s: PacingFiltersSnapshot): {
  clients_id?: string
  media_type?: string
  status?: string
  date_from: string
  date_to: string
  search?: string
} {
  return {
    ...(s.client_ids.length > 0 ? { clients_id: s.client_ids.join(",") } : {}),
    ...(s.media_types.length > 0 ? { media_type: s.media_types.join(",") } : {}),
    ...(s.statuses.length > 0 ? { status: s.statuses.join(",") } : {}),
    date_from: s.date_from,
    date_to: s.date_to,
    ...(s.search.trim() ? { search: s.search.trim() } : {}),
  }
}

export function alertsApiParamsFromSnapshot(s: PacingFiltersSnapshot): {
  clients_id?: string
  media_type?: string
} {
  return {
    ...(s.client_ids.length > 0 ? { clients_id: s.client_ids.join(",") } : {}),
    ...(s.media_types.length > 0 ? { media_type: s.media_types.join(",") } : {}),
  }
}

export function parseFiltersSnapshot(raw: unknown): PacingFiltersSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const client_ids = Array.isArray(o.client_ids)
    ? o.client_ids.map((x) => String(x)).filter(Boolean)
    : []
  const media_types = Array.isArray(o.media_types)
    ? o.media_types.map((x) => String(x)).filter(Boolean)
    : []
  const statuses = Array.isArray(o.statuses) ? o.statuses.map((x) => String(x)).filter(Boolean) : []
  const date_from = typeof o.date_from === "string" ? o.date_from : ""
  const date_to = typeof o.date_to === "string" ? o.date_to : ""
  const search = typeof o.search === "string" ? o.search : ""
  if (!date_from || !date_to) return null
  return { client_ids, media_types, statuses, date_from, date_to, search }
}
