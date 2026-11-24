import { monthExGstFromScheduleEntry } from "@/lib/finance/computeBillableAlignedMbaTotal"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { toCents } from "@/lib/money"

/** Rounding between keyed Xero invoices and the plan; the $1 the Xero match and clearance use. */
const ABOVE_PLAN_TOLERANCE_CENTS = 100

/**
 * S14 A: how much of a record about to go to Xero is above plan, integer cents.
 * Two checks, both for the record's MBA:
 * - the month: already billed this month plus this record, against what the
 *   plan bills this month (the S12 billing-month function);
 * - the campaign: already billed in every month plus this record, against what
 *   the plan bills in total.
 * Billed is sent invoices (`billedSentSql`, C-399). Over the tolerance, the
 * larger excess is above plan, capped at the record itself; else 0.
 */
export function centsAbovePlan(x: {
  toBillCents: number
  planMonthCents: number
  planTotalCents: number
  billedMonthCents: number
  billedTotalCents: number
}): number {
  const over = Math.max(
    x.billedMonthCents + x.toBillCents - x.planMonthCents,
    x.billedTotalCents + x.toBillCents - x.planTotalCents,
  )
  // A $0 or credit record never adds to the bill, so it is never above plan.
  return over > ABOVE_PLAN_TOLERANCE_CENTS ? Math.max(0, Math.min(over, x.toBillCents)) : 0
}

/** What the plan bills over every month: the billing-month function's month total, summed. */
export function planBillingTotalCents(version: Record<string, unknown>): number {
  const schedule = computeCampaignFinancialsFromVersion(version)?.billingSchedule ?? []
  return schedule.reduce(
    (sum, entry) => sum + toCents(monthExGstFromScheduleEntry(entry as unknown as Record<string, unknown>)),
    0,
  )
}

export type AbovePlanReason = { reason: string; coversCents: number; byName: string | null; at: string }

export type AbovePlanHold = {
  invoiceKey: string
  persistedId: number
  clientName: string
  mbaNumber: string
  billingMonth: string
  toBillCents: number
  planMonthCents: number
  planTotalCents: number
  billedMonthCents: number
  billedTotalCents: number
  abovePlanCents: number
  /** The latest reason, when it no longer covers the amount above plan. */
  reason: AbovePlanReason | null
}
