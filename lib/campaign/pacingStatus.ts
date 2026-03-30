export type PacingStatus = "over-delivering" | "on-track" | "watch" | "under-pacing"

export function getPacingStatus(pacingPct: number): PacingStatus {
  if (!Number.isFinite(pacingPct)) return "on-track"
  if (pacingPct >= 110) return "over-delivering"
  if (pacingPct >= 90) return "on-track"
  if (pacingPct >= 70) return "watch"
  return "under-pacing"
}

export function getPacingStatusColor(status: PacingStatus): string {
  if (status === "over-delivering") return "text-emerald-600"
  if (status === "on-track") return "text-blue-600"
  if (status === "watch") return "text-amber-600"
  return "text-red-600"
}

export function getPacingStatusLabel(status: PacingStatus): string {
  if (status === "over-delivering") return "Over delivering"
  if (status === "on-track") return "On track"
  if (status === "watch") return "Watch"
  return "Under pacing"
}

export function getPacingBorderClass(pacingPct: number): string {
  const status = getPacingStatus(pacingPct)
  if (status === "over-delivering") return "border-l-4 border-l-emerald-500"
  if (status === "on-track") return "border-l-4 border-l-blue-500"
  if (status === "watch") return "border-l-4 border-l-amber-500"
  return "border-l-4 border-l-red-500"
}
