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
