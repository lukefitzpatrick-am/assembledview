export type PacingFilterStatusBand = "behind" | "on-track" | "ahead" | "no-data"

export const PACING_MEDIA_TYPE_OPTIONS = [
  { value: "search", label: "Search" },
  { value: "social", label: "Social" },
  { value: "display", label: "Display" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "bvod", label: "BVOD" },
  { value: "ooh", label: "OOH" },
  { value: "direct", label: "Direct" },
] as const

/** Filter list only — 4 bands carried on search/social/programmatic rows. */
export const PACING_STATUS_OPTIONS: { value: PacingFilterStatusBand; label: string }[] = [
  { value: "behind", label: "Behind" },
  { value: "on-track", label: "On track" },
  { value: "ahead", label: "Ahead" },
  { value: "no-data", label: "No data" },
]

export type PacingFiltersSnapshot = {
  client_ids: string[]
  media_types: string[]
  statuses: string[]
  /** Melbourne YYYY-MM-DD; maps to API `asOfDate` (server-side only). */
  as_of_date: string
  search: string
}
