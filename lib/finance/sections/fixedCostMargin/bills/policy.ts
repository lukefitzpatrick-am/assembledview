/**
 * Xero bill cost rules for the fixed cost margin report (Luke, 27 Oct 2026).
 * Each rule is one named constant or one small function, so a change of mind
 * is a one-line edit. Pure. No I/O. Money is integer cents.
 */

/**
 * Advertising Associates bills are gross. AA rebates its commission to us.
 * Assumed rate until the real rebate documents are tied in: net = gross x 0.92.
 */
export const AA_REBATE_RATE = 0.08

/** Bill statuses that count as cost (Luke, 27 Oct: AUTHORISED and PAID only). */
export const COUNTED_BILL_STATUSES: ReadonlySet<string> = new Set(["AUTHORISED", "PAID"])

/** Bill statuses shown in the pending column, not counted as cost. */
export const PENDING_BILL_STATUSES: ReadonlySet<string> = new Set(["DRAFT", "SUBMITTED"])

/** Never loaded. */
export const IGNORED_BILL_STATUSES: ReadonlySet<string> = new Set(["DELETED", "VOIDED"])

export type BillStatusClass = "counted" | "pending" | "ignored"

export function classifyBillStatus(status: string): BillStatusClass {
  const s = status.trim().toUpperCase()
  if (COUNTED_BILL_STATUSES.has(s)) return "counted"
  if (PENDING_BILL_STATUSES.has(s)) return "pending"
  return "ignored"
}

export type RebateSplit = { grossCents: number; rebateCents: number; netCents: number }

/** Gross, rebate and net for one bill line. Only AA bills carry the rebate. */
export function splitRebate(grossCents: number, isAdvertisingAssociates: boolean): RebateSplit {
  if (!isAdvertisingAssociates) return { grossCents, rebateCents: 0, netCents: grossCents }
  const rebateCents = Math.round(grossCents * AA_REBATE_RATE)
  return { grossCents, rebateCents, netCents: grossCents - rebateCents }
}

export type BillLineMonths = {
  /** Month the cost is reported in for margin: the bill's issue month. */
  billedMonth: string
  /** Month the media ran: the week date on the line, else the billed month. */
  deliveredMonth: string
}

/**
 * Month assignment for a bill line (Luke, 27 Oct, Q7: "keep billing based on
 * billed months"). Margin uses the billed month, which is the bill's issue
 * month for every supplier. The delivered month is the week date on the bill
 * line when there is one (Advertising Associates), else the billed month
 * (a Channel Factory bill covers its issue month; a line with no date).
 */
export function assignBillLineMonths(input: {
  issueDate: string
  weekDate: string | null
}): BillLineMonths {
  const billedMonth = input.issueDate.slice(0, 7)
  const deliveredMonth = input.weekDate ? input.weekDate.slice(0, 7) : billedMonth
  return { billedMonth, deliveredMonth }
}

/**
 * Amount tie-break tolerance when several plan lines share an MBA, publisher
 * and month: a bill line matches the one line whose billed amount that month
 * is within this many cents of the bill line's gross.
 */
export const AMOUNT_MATCH_TOLERANCE_CENTS = 100
