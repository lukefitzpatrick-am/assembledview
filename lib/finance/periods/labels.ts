import type { FinancePeriodStatus, FinanceRunItemStatus } from "@/lib/finance/periods/types"

/** Ladder order — mirrors finance_periods.status constraint / PC5. */
export const PERIOD_STATUS_LADDER: FinancePeriodStatus[] = [
  "open",
  "pre_run_review",
  "run",
  "review",
  "locked",
  "invoiced",
  "reconciled",
]

export const PERIOD_STATUS_LABEL: Record<FinancePeriodStatus, string> = {
  open: "Open",
  pre_run_review: "Pre-run review",
  run: "Run",
  review: "Review",
  locked: "Locked",
  invoiced: "Invoiced",
  reconciled: "Reconciled",
}

export const RUN_ITEM_STATUS_LABEL: Record<FinanceRunItemStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  adjusted: "Adjusted",
  held: "Held",
  excluded: "Excluded",
  stale: "Stale",
}

export function formatPeriodMonthLong(periodMonth: string): string {
  const d = new Date(`${periodMonth}-01T00:00:00`)
  if (Number.isNaN(d.getTime())) return periodMonth
  return d.toLocaleString("en-AU", { month: "long", year: "numeric" })
}

export function formatPeriodTs(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
