/**
 * Media-plans list status display — stored status is the single source of truth.
 * Never overwrite Booked/Approved/etc. with a date-derived "Completed".
 */

export const CAMPAIGN_LIST_STATUSES = [
  "Booked",
  "Approved",
  "Planned",
  "Draft",
  "Completed",
  "Cancelled",
] as const

export type CampaignListStatus = (typeof CAMPAIGN_LIST_STATUSES)[number]

const KNOWN = new Set<string>(CAMPAIGN_LIST_STATUSES.map((s) => s.toLowerCase()))

/** Title-case known statuses; leave unknown strings readable without inventing Completed. */
export function normalizeStoredCampaignStatus(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (!s) return "Draft"
  const lower = s.toLowerCase()
  if (KNOWN.has(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }
  // Preserve unknown enums (e.g. "In-Progress") without forcing Completed.
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function isScheduleEnded(endDateRaw: unknown, today: Date = new Date()): boolean {
  if (typeof endDateRaw !== "string" || !endDateRaw.trim()) return false
  const end = new Date(endDateRaw)
  if (Number.isNaN(end.getTime())) return false
  return end < today
}

/** Live / in-market: stored status is Booked or Approved and today is within the flight. */
export function isInMarketNow(
  plan: { campaign_status?: string; campaign_start_date?: string; campaign_end_date?: string },
  today: Date = new Date(),
): boolean {
  const status = normalizeStoredCampaignStatus(plan.campaign_status).toLowerCase()
  if (status !== "booked" && status !== "approved") return false
  const start = new Date(plan.campaign_start_date || "")
  const end = new Date(plan.campaign_end_date || "")
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const t = today.getTime()
  return start.getTime() <= t && end.getTime() >= t
}
