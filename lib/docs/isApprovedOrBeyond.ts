/**
 * PC3 / commercial — approved-or-beyond gate (Bucket B).
 * approved / booked / completed (case-insensitive). Draft/planned/cancelled → false.
 *
 * VC Stage 1: do NOT use this for publication. Publication is
 * `isVersionPublished` (`published_at != null`) in
 * `lib/mediaplan/versionPublication.ts`. This helper remains for genuine
 * commercial-status consumers.
 */

import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

const APPROVED_OR_BEYOND = new Set(["approved", "booked", "completed"])

export function isApprovedOrBeyond(status: unknown): boolean {
  return APPROVED_OR_BEYOND.has(normaliseStatus(status))
}

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
