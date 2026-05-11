import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"

const PACING_LABEL: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  slightly_under: "Slightly under",
  under_pacing: "Under pacing",
  slightly_over: "Slightly over",
  over_pacing: "Over pacing",
  no_delivery: "No delivery",
  completed: "Completed",
}

function normalizeKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase().replace(/ /g, "_")
}

/** Maps line-item pacing_status strings onto shared dashboard StatusPill tokens. */
export function pacingStatusForStatusPill(raw: string | null | undefined): {
  status: DeliveryStatus
  label: string
} {
  const key = normalizeKey(raw)
  const label = key in PACING_LABEL ? PACING_LABEL[key]! : raw ? String(raw) : "Unknown"

  if (key === "on_track" || key === "completed") {
    return { status: "on-track", label }
  }
  if (key === "not_started") {
    return { status: "no-data", label }
  }
  if (key === "slightly_under" || key === "under_pacing" || key === "no_delivery") {
    return { status: "behind", label }
  }
  if (key === "slightly_over" || key === "over_pacing") {
    return { status: "ahead", label }
  }
  return { status: "no-data", label }
}
