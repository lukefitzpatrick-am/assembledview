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

export type PacingFiltersSnapshot = {
  client_ids: string[]
  media_types: string[]
  statuses: string[]
  date_from: string
  date_to: string
  search: string
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
