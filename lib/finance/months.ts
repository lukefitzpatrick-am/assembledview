/** Current calendar month as `YYYY-MM` (billing_month). */
export function getCurrentBillingMonth(today: Date = new Date()): string {
  const y = today.getFullYear()
  const m = today.getMonth()
  return `${y}-${String(m + 1).padStart(2, "0")}`
}

/** Current calendar month and the following month as `YYYY-MM` (billing_month). */
export function getCurrentAndNextBillingMonths(today: Date = new Date()): [string, string] {
  const y = today.getFullYear()
  const m = today.getMonth()
  const cur = `${y}-${String(m + 1).padStart(2, "0")}`
  const nextDate = new Date(y, m + 1, 1)
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`
  return [cur, next]
}

/**
 * Calendar year of the July that starts the Australian FY containing `date`.
 * E.g. 2026-07-11 → 2026; 2026-03-01 → 2025.
 */
export function australianFyStartYearForDate(date: Date = new Date()): number {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return m >= 7 ? y : y - 1
}

/** 1 July of `fyStartYear` — pass into Date-based FY window helpers. */
export function referenceDateForFyStartYear(fyStartYear: number): Date {
  return new Date(fyStartYear, 6, 1)
}

/** Display label e.g. `2025–26` for fyStartYear 2025. */
export function fyDisplayLabel(fyStartYear: number): string {
  return `${fyStartYear}–${String(fyStartYear + 1).slice(-2)}`
}

/** Hub FY selector: current FY, back 2, forward 1. */
export function fySelectOptions(reference: Date = new Date()): number[] {
  const current = australianFyStartYearForDate(reference)
  return [current - 2, current - 1, current, current + 1]
}

/** Full Jul→Jun `YYYY-MM` range for a FY start year. */
export function fyMonthRange(fyStartYear: number): { from: string; to: string } {
  const months = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fyStartYear))
  return { from: months[0]!, to: months[months.length - 1]! }
}

/** Every `YYYY-MM` billing month in the Australian financial year that contains `reference` (July → June). */
export function billingMonthsInAustralianFinancialYear(reference: Date = new Date()): string[] {
  const y = reference.getFullYear()
  const mo = reference.getMonth() + 1
  const startYear = mo >= 7 ? y : y - 1
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, 6 + i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}
