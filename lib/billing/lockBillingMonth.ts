/**
 * C-14 lock predicate — re-exports PC5 period-aware implementation.
 * Month keys must be YYYY-MM; lock cutoff = Sydney wall-clock via finance_periods.status.
 */
export {
  isBillingMonthLocked,
  isPeriodAmendableByAdmin,
} from "@/lib/finance/periods/lockBillingMonth"
