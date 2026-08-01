/**
 * PC3 — approved-or-beyond gate for document generation.
 * approved / booked / completed (case-insensitive). Draft/planned → reject.
 */

import { normalizeStatus } from "@/lib/api/dashboard/shared"

const APPROVED_OR_BEYOND = new Set(["approved", "booked", "completed"])

export function isApprovedOrBeyond(status: unknown): boolean {
  const s = normalizeStatus(status)
  return APPROVED_OR_BEYOND.has(s)
}
