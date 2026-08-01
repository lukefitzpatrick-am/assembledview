/**
 * Default finance-sections scope: current AU FY + FY-to-date months (never a single month).
 * July review P0-2: landing must be populated on arrival with FYTD, not current month alone.
 */

import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  getCurrentBillingMonth,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import type { MonthRange } from "@/lib/finance/monthRange"

export type FinanceBasisDefault = "booked" | "billed"

export type FinanceScopeValues = {
  fy: number
  monthRange: MonthRange
  clients: number[]
  basisDefault: FinanceBasisDefault
}

/** Melbourne-ish calendar parts via local Date (hub FY helpers use the same shape). */
export function buildDefaultFinanceScope(today: Date = new Date()): FinanceScopeValues {
  const fy = australianFyStartYearForDate(today)
  const currentMonth = getCurrentBillingMonth(today)
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const fytdMonths = fyMonths.filter((m) => m <= currentMonth)
  const from = fytdMonths[0] ?? fyMonths[0]!
  const to = fytdMonths[fytdMonths.length - 1] ?? currentMonth
  return {
    fy,
    monthRange: { from, to },
    clients: [],
    basisDefault: "booked",
  }
}

/** Clamp month range to months inside the FY; keep FYTD semantics when empty. */
export function clampMonthRangeToFy(
  fy: number,
  range: MonthRange,
  today: Date = new Date()
): MonthRange {
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const fySet = new Set(fyMonths)
  let from = range.from
  let to = range.to
  if (!fySet.has(from)) from = fyMonths[0]!
  if (!fySet.has(to)) to = fyMonths[fyMonths.length - 1]!
  if (from > to) [from, to] = [to, from]
  const currentFy = australianFyStartYearForDate(today)
  if (fy === currentFy) {
    const currentMonth = getCurrentBillingMonth(today)
    if (to > currentMonth) to = currentMonth
  }
  return { from, to }
}
