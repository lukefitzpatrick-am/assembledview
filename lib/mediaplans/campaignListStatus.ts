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
