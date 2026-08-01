/**
 * CP-3 / FS-2 — finance sections campaign-status scope.
 *
 * Included in schedule totals: approved | booked | completed.
 * Excluded (surfaced in coverage.excludedByStatusCents, never silent-drop):
 * draft | planned | cancelled.
 *
 * Version authority remains published tip + schedule_months (D1) — this filter
 * is status-only, not a relevantPlanVersions pool.
 */

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

/** SQL boolean — published tip is in the finance-included status set. */
export const FINANCE_STATUS_INCLUDED_SQL = `(LOWER(COALESCE(v.campaign_status, '')) IN ('approved', 'booked', 'completed'))`

/** SQL boolean — published tip is draft/planned/cancelled (coverage bucket). */
export const FINANCE_STATUS_EXCLUDED_SQL = `(LOWER(COALESCE(v.campaign_status, '')) IN ('draft', 'planned', 'cancelled'))`

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
