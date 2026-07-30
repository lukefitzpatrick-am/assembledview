import { toPeriodMonthKey } from "@/lib/finance/periods/monthKey"
import type { FinancePeriod, FinancePeriodStatus } from "@/lib/finance/periods/types"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"

const LOCKED_STATUSES: ReadonlySet<FinancePeriodStatus> = new Set([
  "locked",
  "invoiced",
  "reconciled",
])

/**
 * C-14: month keys are YYYY-MM; lock cutoff = Sydney wall-clock via period status
 * (period.locked_at / status), not a floating UTC +60d heuristic.
 *
 * When `period` is provided: locked iff status ∈ locked|invoiced|reconciled.
 * When absent (shadow / no row): advisory lock only after Sydney last-day 23:59
 * of that month has passed (for UI hints).
 */
export function isBillingMonthLocked(
  billingMonth: string,
  opts: {
    now?: Date
    period?: Pick<FinancePeriod, "status" | "lockedAt"> | null
  } = {}
): boolean {
  const key = toPeriodMonthKey(billingMonth)
  const period = opts.period
  if (period) {
    return LOCKED_STATUSES.has(period.status)
  }

  const now = opts.now ?? new Date()
  const sydney = getSydneyWallClock(now)
  // Before the period month ends in Sydney → not locked
  if (sydney.periodMonth < key) return false
  if (sydney.periodMonth > key) return true
  // Same month: locked only after last day 23:59 Sydney
  if (!sydney.isLastDayOfMonth) return false
  if (sydney.hour < 23) return false
  return sydney.minute >= 59
}

export function isPeriodAmendableByAdmin(period: Pick<FinancePeriod, "status">): boolean {
  return LOCKED_STATUSES.has(period.status)
}
