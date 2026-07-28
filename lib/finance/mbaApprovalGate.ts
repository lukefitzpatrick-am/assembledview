/**
 * Plan C S1-P4 — whether a media_plan_version "carries an approval" for MBA docs.
 *
 * Findings (persisted approval signals):
 * - `mba_line_approvals`: exclusion table — absence of rows means full-MBA all-in
 *   (approved). Presence of `approved: false` rows = partial exclusions. This table
 *   alone cannot distinguish "never approved" draft from "full MBA approved".
 * - `appendPartialApprovalToBillingSchedule`: stamps `partialApproval` metadata onto
 *   each billing-schedule month when `isPartial === true`. Cleared on full MBA saves.
 * - `campaign_status`: lifecycle — draft/planned vs pending-approval/approved/booked/completed.
 *
 * Gate used for MBA PDF under PLANC_DOCS_FROM_PERSISTED:
 *   pending-approval | approved | booked | completed
 *   OR billing schedule carries partialApproval.isPartial
 */

import { getBillingSchedule } from "@/lib/finance/normalizeFields"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"

const APPROVAL_STATUSES = new Set([
  "pending-approval",
  "pending_approval",
  "approved",
  "booked",
  "completed",
])

export type MbaApprovalGateResult = {
  ok: boolean
  reason:
    | "status"
    | "partial_approval_meta"
    | "missing"
  status: string
  hasPartialApprovalMeta: boolean
}

function normalizeStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
}

export function extractPartialApprovalFromVersion(
  version: Record<string, unknown>
): { isPartial: boolean } | null {
  const months = parsePersistedBillingScheduleToMonths(getBillingSchedule(version))
  if (!months?.length) {
    // Also scan raw array for metadata if parse stripped unknown keys
    const raw = getBillingSchedule(version)
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (() => {
            try {
              const p = JSON.parse(raw)
              return Array.isArray(p) ? p : []
            } catch {
              return []
            }
          })()
        : []
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue
      const meta = (entry as { partialApproval?: { isPartial?: boolean } }).partialApproval
      if (meta?.isPartial === true) return { isPartial: true }
    }
    return null
  }

  for (const month of months as Array<Record<string, unknown>>) {
    const meta = month.partialApproval as { isPartial?: boolean } | undefined
    if (meta && typeof meta === "object" && meta.isPartial === true) {
      return { isPartial: true }
    }
  }

  // parsePersisted may drop partialApproval — check raw
  const raw = getBillingSchedule(version)
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue
      const meta = (entry as { partialApproval?: { isPartial?: boolean } }).partialApproval
      if (meta?.isPartial === true) return { isPartial: true }
    }
  }
  return null
}

export function evaluateMbaApprovalGate(
  version: Record<string, unknown>
): MbaApprovalGateResult {
  const status = normalizeStatus(
    version.campaign_status ?? version.mp_campaignstatus ?? version.status
  )
  const partial = extractPartialApprovalFromVersion(version)
  const hasPartialApprovalMeta = partial?.isPartial === true

  if (APPROVAL_STATUSES.has(status)) {
    return {
      ok: true,
      reason: "status",
      status,
      hasPartialApprovalMeta,
    }
  }
  if (hasPartialApprovalMeta) {
    return {
      ok: true,
      reason: "partial_approval_meta",
      status,
      hasPartialApprovalMeta: true,
    }
  }
  return {
    ok: false,
    reason: "missing",
    status,
    hasPartialApprovalMeta: false,
  }
}

export function versionCarriesMbaApproval(version: Record<string, unknown>): boolean {
  return evaluateMbaApprovalGate(version).ok
}
