/**
 * Billing immutability only (Bucket B / MB-15c). Not publication.
 *
 * Commercial set is `approved` | `booked`. `completed` is a derived phase —
 * treat `resolveCampaignPhase(...).phase === "completed"` as beyond (legacy
 * stored `completed` and approved/booked after end). Dates optional: billing
 * writers often have status only; stored `completed` still resolves as phase
 * completed with no dates.
 *
 * Publication is `isVersionPublished` (`published_at != null`) in
 * `lib/mediaplan/versionPublication.ts`. Do NOT use this for download.
 * `isDownloadableCampaignStatus` is a leftover hotfix (everything except draft)
 * — unused by generate/download; do not merge the two predicates.
 */

import { resolveCampaignPhase } from "@/lib/mediaplan/campaignPhase"
import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

const APPROVED_OR_BOOKED = new Set(["approved", "booked"])

export function isApprovedOrBeyond(
  status: unknown,
  dates?: {
    startDate?: string | null
    endDate?: string | null
    today?: Date
  }
): boolean {
  const stored = normaliseStatus(status)
  if (APPROVED_OR_BOOKED.has(stored)) return true
  return (
    resolveCampaignPhase({
      status,
      startDate: dates?.startDate,
      endDate: dates?.endDate,
      today: dates?.today,
    }).phase === "completed"
  )
}

/**
 * Leftover hotfix. "May the client have this document?" was everything except draft.
 * Generate/download call sites use `isVersionPublished` instead. Keep exported so the
 * two questions stay separate — do not merge with isApprovedOrBeyond.
 */
const NOT_DOWNLOADABLE = new Set(["draft"])
export function isDownloadableCampaignStatus(status: unknown): boolean {
  const s = normaliseStatus(status)
  return s.length > 0 && !NOT_DOWNLOADABLE.has(s)
}

export const DOWNLOAD_BLOCKED_MESSAGE =
  "Publish this plan to download and send to client"

/** UI copy when billing timing is locked on a published version (MB-15c). */
export function publishedBillingTimingLockedMessage(args?: {
  status?: unknown
  versionNumber?: number | string | null
}): string {
  const status = normaliseStatus(args?.status)
  const vn =
    args?.versionNumber != null && String(args.versionNumber).trim() !== ""
      ? String(args.versionNumber).trim()
      : null
  const where =
    status && vn
      ? ` (v${vn}, ${status})`
      : status
        ? ` (${status})`
        : vn
          ? ` (v${vn})`
          : ""
  return `Billing timing is locked on this published version${where}. Change timing by publishing a new version.`
}
