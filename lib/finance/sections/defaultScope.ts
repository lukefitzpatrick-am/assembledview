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

/**
 * Snap from/to into the FY and keep from ≤ to.
 * Does not cap at the current month — a future month in the current FY is legal.
 */
export function normaliseToFy(fy: number, range: MonthRange): MonthRange {
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const fySet = new Set(fyMonths)
  let from = range.from
  let to = range.to
  if (!fySet.has(from)) from = fyMonths[0]!
  if (!fySet.has(to)) to = fyMonths[fyMonths.length - 1]!
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

/**
 * Default/initial scope only: if this is the current FY, snap `to` down to today.
 * Past FYs are unchanged. Call after `normaliseToFy`.
 */
export function clampToCurrentMonth(
  fy: number,
  range: MonthRange,
  today: Date = new Date()
): MonthRange {
  const currentFy = australianFyStartYearForDate(today)
  if (fy !== currentFy) return { from: range.from, to: range.to }
  const currentMonth = getCurrentBillingMonth(today)
  let { from, to } = range
  if (to > currentMonth) to = currentMonth
  if (from > to) from = to
  return { from, to }
}

/** Melbourne-ish calendar parts via local Date (hub FY helpers use the same shape). */
export function buildDefaultFinanceScope(today: Date = new Date()): FinanceScopeValues {
  const fy = australianFyStartYearForDate(today)
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const monthRange = clampToCurrentMonth(
    fy,
    normaliseToFy(fy, { from: fyMonths[0]!, to: fyMonths[fyMonths.length - 1]! }),
    today
  )
  return {
    fy,
    monthRange,
    clients: [],
    basisDefault: "booked",
  }
}
