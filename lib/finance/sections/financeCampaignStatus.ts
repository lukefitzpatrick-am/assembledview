/**
 * CP-3 / FS-2 — finance sections campaign-status scope.
 *
 * Included in schedule totals: approved | booked | completed.
 * Excluded (surfaced in coverage.excludedByStatusCents, never silent-drop):
 * draft | planned | cancelled.
 *
 * Commercial status is a master fact. SQL constants read `m.campaign_status`.
 * JS readers use {@link resolveFinanceCampaignStatus} after
 * {@link stampMasterCampaignStatus} threads the master onto version objects.
 *
 * Version authority remains published tip + schedule_months (D1) — this filter
 * is status-only, not a relevantPlanVersions pool.
 */

import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"

export const FINANCE_INCLUDED_CAMPAIGN_STATUSES = [
  "approved",
  "booked",
  "completed",
] as const

export const FINANCE_EXCLUDED_CAMPAIGN_STATUSES = [
  "draft",
  "planned",
  "cancelled",
] as const

export type FinanceIncludedCampaignStatus =
  (typeof FINANCE_INCLUDED_CAMPAIGN_STATUSES)[number]

export type FinanceExcludedCampaignStatus =
  (typeof FINANCE_EXCLUDED_CAMPAIGN_STATUSES)[number]

const INCLUDED = new Set<string>(FINANCE_INCLUDED_CAMPAIGN_STATUSES)
const EXCLUDED = new Set<string>(FINANCE_EXCLUDED_CAMPAIGN_STATUSES)

export function isFinanceIncludedCampaignStatus(
  status: string | null | undefined
): boolean {
  return INCLUDED.has(String(status ?? "").toLowerCase())
}

export function isFinanceExcludedCampaignStatus(
  status: string | null | undefined
): boolean {
  return EXCLUDED.has(String(status ?? "").toLowerCase())
}

/**
 * SQL boolean — published tip is in the finance-included status set.
 * Reads `media_plan_masters.campaign_status` (alias `m`). Every query that
 * interpolates this must `FROM media_plan_masters m`.
 */
export const FINANCE_STATUS_INCLUDED_SQL = `(LOWER(COALESCE(m.campaign_status, '')) IN ('approved', 'booked', 'completed'))`

/**
 * SQL boolean — published tip is draft/planned/cancelled (coverage bucket).
 * Same master alias `m` as {@link FINANCE_STATUS_INCLUDED_SQL}.
 */
export const FINANCE_STATUS_EXCLUDED_SQL = `(LOWER(COALESCE(m.campaign_status, '')) IN ('draft', 'planned', 'cancelled'))`

export type FinanceCampaignStatusRow = {
  master_campaign_status?: unknown
  masterCampaignStatus?: unknown
  campaign_status?: unknown
  mp_campaignstatus?: unknown
}

/**
 * Commercial status for finance include/exclude.
 * Prefer threaded master status when the key is present (including blank).
 * Fall back to the version snapshot only when the master was never stamped —
 * fixtures and pre-overlay callers.
 */
export function resolveFinanceCampaignStatus(
  row: FinanceCampaignStatusRow | Record<string, unknown> | null | undefined
): string {
  if (!row || typeof row !== "object") return ""
  const rec = row as FinanceCampaignStatusRow
  const master = rec.master_campaign_status ?? rec.masterCampaignStatus
  if (master !== undefined) {
    return String(master ?? "").trim().toLowerCase()
  }
  return String(rec.campaign_status ?? rec.mp_campaignstatus ?? "")
    .trim()
    .toLowerCase()
}

/**
 * Thread `media_plan_masters.campaign_status` onto version rows as
 * `master_campaign_status`. Mutates in place. Does not rewrite `campaign_status`
 * (that column is historical).
 */
export function stampMasterCampaignStatus(
  versions: Record<string, unknown>[],
  masters: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown>[] {
  const byMba = new Map<string, string>()
  for (const master of masters) {
    const key = mbaJoinKey(master?.mba_number)
    if (!key) continue
    byMba.set(key, String(master?.campaign_status ?? ""))
  }
  for (const version of versions) {
    const key = mbaJoinKey(version.mba_number)
    if (!key || !byMba.has(key)) continue
    version.master_campaign_status = byMba.get(key)
  }
  return versions
}

/** Exact Costs / payables tile caption (Luke-signed). */
export const PAYABLES_MEDIA_ONLY_BASIS_CAPTION =
  "Booked cost = media on the delivery schedule · campaign statuses approved/booked/completed"

/** Overview payables tile basis (media-only, status-scoped). */
export const PAYABLES_FYTD_BASIS =
  "delivery · media only (ex client-pays) · statuses approved/booked/completed"

/** Format the Costs overview excluded-status caption (never silent-drop). */
export function formatExcludedByStatusCaption(excludedMediaCents: number): string {
  const dollars = (excludedMediaCents / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `Excludes ${dollars} in draft/planned/cancelled campaigns`
}

export type ExcludedByStatusCents = {
  media: number
  fee: number
  adserving: number
}
