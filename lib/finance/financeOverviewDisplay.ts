import { expandMonthRange } from "@/lib/finance/monthRange"

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** Format `YYYY-MM` as `Jul 2026` for Current-month KPI labels. */
export function formatCurrentMonthKpiLabel(monthIso: string): string {
  const [yRaw, mRaw] = monthIso.split("-")
  const year = Number(yRaw)
  const monthIndex = Number(mRaw) - 1
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return monthIso
  return `${MONTH_LABELS[monthIndex]} ${year}`
}

/** True when every FY-to-date month is present in the hub month range. */
export function monthRangeCoversFyToDate(
  monthRange: { from: string; to: string },
  fyMonthsToDate: string[]
): boolean {
  if (fyMonthsToDate.length === 0) return true
  const have = new Set(expandMonthRange(monthRange))
  return fyMonthsToDate.every((m) => have.has(m))
}

export type AsyncKpiState = "loading" | "error" | "ready"

export function resolveAsyncKpiState(opts: {
  loading: boolean
  error: string | null
}): AsyncKpiState {
  if (opts.loading) return "loading"
  if (opts.error) return "error"
  return "ready"
}

/** @deprecated alias — prefer resolveAsyncKpiState */
export const resolveScheduleFytdKpiState = resolveAsyncKpiState
export type ScheduleFytdKpiState = AsyncKpiState

export type NetAccrualKpiState = "deferred" | "loading" | "ready"

export function resolveNetAccrualKpiState(opts: {
  storeLoading: boolean
  rangeCoversFyToDate: boolean
}): NetAccrualKpiState {
  if (!opts.rangeCoversFyToDate) return "deferred"
  if (opts.storeLoading) return "loading"
  return "ready"
}

export type OverviewSpendChartMode =
  | "loading"
  | "treemap"
  | "fallback-bar"
  | "deferred"
  | "empty"

/**
 * Treemap from dashboard_monthly_* when present; otherwise FY client-billing bar from store
 * (only once hub range covers FY-to-date). Deferred when treemap is empty and range does not
 * yet cover FY. Empty only when both are ready-but-empty.
 */
export function resolveOverviewSpendChartMode(opts: {
  chartsLoading: boolean
  storeLoading: boolean
  treemapHasData: boolean
  fyBillingBarHasData: boolean
  rangeCoversFyToDate: boolean
}): OverviewSpendChartMode {
  if (opts.chartsLoading) return "loading"
  if (opts.treemapHasData) return "treemap"
  if (!opts.rangeCoversFyToDate) return "deferred"
  if (opts.storeLoading) return "loading"
  if (opts.fyBillingBarHasData) return "fallback-bar"
  return "empty"
}
