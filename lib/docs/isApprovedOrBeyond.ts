/**
 * PC3 / MB-15c — approved-or-beyond gate.
 * approved / booked / completed (case-insensitive). Draft/planned/cancelled → false.
 *
 * Single definition for MBA document generate AND published-version billing immutability.
 * Uses mediaplan status normalisation (not a second status vocabulary).
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
