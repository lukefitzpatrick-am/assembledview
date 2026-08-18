/**
 * PC3 / MB-15c — approved-or-beyond gate.
 * approved / booked / completed (case-insensitive). Draft/planned/cancelled → false.
 *
 * Billing immutability only. MBA document generate/download uses
 * isDownloadableCampaignStatus — do not merge the two predicates.
 * Uses mediaplan status normalisation (not a second status vocabulary).
 */

import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

const APPROVED_OR_BEYOND = new Set(["approved", "booked", "completed"])

export function isApprovedOrBeyond(status: unknown): boolean {
  return APPROVED_OR_BEYOND.has(normaliseStatus(status))
}

/**
 * Download / document gate (18 Aug 2026 hotfix). "May the client have this document?"
 * Everything except draft. Empty / unknown status refuses.
 * NOT the same question as isApprovedOrBeyond ("may this still be edited") — do not merge
 * these two predicates. planned is downloadable AND still editable.
 */
const NOT_DOWNLOADABLE = new Set(["draft"])
export function isDownloadableCampaignStatus(status: unknown): boolean {
  const s = normaliseStatus(status)
  return s.length > 0 && !NOT_DOWNLOADABLE.has(s)
}

export const DOWNLOAD_BLOCKED_MESSAGE =
  "Set the campaign status past Draft to download and send to client"

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
