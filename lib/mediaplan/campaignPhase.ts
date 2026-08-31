import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

export const CAMPAIGN_PHASES = [
  "planned",
  "approved",
  "booked",
  "live",
  "completed",
  "cancelled",
] as const

export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number]

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

function calendarYmd(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!DATE_ONLY_RE.test(trimmed)) return null
  return trimmed
}

/**
 * UTC instant that maps to `ymd` as an Australia/Sydney civil day.
 * 02:00Z is always that YMD in Sydney (AEST/AEDT).
 */
export function sydneyCivilDayFromYmd(ymd: string): Date {
  return new Date(`${ymd}T02:00:00.000Z`)
}

export type CampaignPhaseInput = {
  status: unknown
  startDate?: string | null
  endDate?: string | null
  today?: Date
}

/** True when derived phase is live or completed (dashboard commercial inclusion). */
export function isLiveOrCompletedPhase(input: CampaignPhaseInput): boolean {
  const phase = resolveCampaignPhase(input).phase
  return phase === "live" || phase === "completed"
}

/**
 * Picker sort rank: derived live first, then stored booked, then stored approved.
 * Never matches a persisted status string of `"live"` — that value is not stored.
 */
export function campaignPickerPriorityRank(input: CampaignPhaseInput): number {
  const phase = resolveCampaignPhase(input).phase
  if (phase === "live") return 0
  if (phase === "booked") return 1
  if (phase === "approved") return 2
  return 3
}

/**
 * Derived delivery phase from persisted commercial status + campaign dates.
 * Never persist the result — `live` is not a stored status.
 */
export function resolveCampaignPhase(input: CampaignPhaseInput): {
  phase: CampaignPhase
  derived: boolean
  reason: string
} {
  const status = normaliseStatus(input.status)
  const todayYmd = formatBurstDateLocal(input.today ?? new Date())
  const start = calendarYmd(input.startDate)
  const end = calendarYmd(input.endDate)

  if (status === "cancelled") {
    return { phase: "cancelled", derived: false, reason: "cancelled" }
  }

  if (status === "draft" || status === "planned") {
    return {
      phase: "planned",
      derived: false,
      reason: status === "draft" ? "legacy draft" : "planned",
    }
  }

  if (status === "approved" || status === "booked") {
    if (!start || !end) {
      return { phase: status, derived: false, reason: "no dates" }
    }
    if (todayYmd < start) {
      return { phase: status, derived: false, reason: "before start" }
    }
    if (todayYmd <= end) {
      return { phase: "live", derived: true, reason: "in range" }
    }
    return { phase: "completed", derived: true, reason: "after end" }
  }

  if (status === "completed") {
    return { phase: "completed", derived: false, reason: "legacy completed" }
  }

  return { phase: "planned", derived: false, reason: "unknown status" }
}
