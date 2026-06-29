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
