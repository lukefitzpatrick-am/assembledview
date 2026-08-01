/**
 * Australian financial year for AVA Postgres tools: `fy` is the ENDING calendar year.
 * fy=2026 → Jul 2025 – Jun 2026 (months >= 2025-07 AND < 2026-07).
 *
 * Do not use finance hub's fyMonthRange (start-year) here — AVA labels match
 * spoken "FY26" / "this FY" ending-year convention.
 */
export type FyRange = {
  /** Inclusive YYYY-MM (July of start calendar year). */
  startMonth: string
  /** Exclusive YYYY-MM (July of ending year). */
  endMonthExclusive: string
  /** Inclusive first-of-month date for date columns. */
  startDate: string
  /** Exclusive first-of-month date (1 Jul of ending year). */
  endDateExclusive: string
  /** Echo label e.g. "2025-07..2026-06". */
  range: string
}

/** Map AU FY ending year → inclusive/exclusive month bounds. */
export function fyToRange(fyEndingYear: number): FyRange {
  const startYear = fyEndingYear - 1
  const startMonth = `${startYear}-07`
  const endMonthExclusive = `${fyEndingYear}-07`
  return {
    startMonth,
    endMonthExclusive,
    startDate: `${startMonth}-01`,
    endDateExclusive: `${endMonthExclusive}-01`,
    range: `${startMonth}..${fyEndingYear}-06`,
  }
}

/** True when YYYY-MM is in [startMonth, endMonthExclusive). */
export function monthKeyInFyRange(monthKey: string, range: FyRange): boolean {
  return monthKey >= range.startMonth && monthKey < range.endMonthExclusive
}
