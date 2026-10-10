/**
 * Presentation sums for the Clients billing stat cards and the Difference pill.
 * Dollars are loaded `record.total` grouped by the derived billing state.
 * A loaded `xero_amount` fills In Xero and the Difference pill. Without it,
 * drafted, issued, issued outside AV, paid and overdue still read "In Xero".
 */

import type { BillingState } from "@/lib/finance/billingLifecycle"
import { formatAUD } from "@/lib/format/money"
import {
  billingMonthsInAustralianFinancialYear,
  getCurrentBillingMonth,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import { toCents } from "@/lib/money"

export type BillingStatCardRecord = {
  total: number
  state?: BillingState | null
  needs_attention?: boolean
}

export type BillingStatCards = {
  expectedCents: number
  expectedCount: number
  draftedCents: number
  draftedCount: number
  draftedDiffersCount: number
  issuedPaidCents: number
  issuedPaidCount: number
  overdueCents: number
  overdueCount: number
}

const EMPTY_CARDS: BillingStatCards = {
  expectedCents: 0,
  expectedCount: 0,
  draftedCents: 0,
  draftedCount: 0,
  draftedDiffersCount: 0,
  issuedPaidCents: 0,
  issuedPaidCount: 0,
  overdueCents: 0,
  overdueCount: 0,
}

export function summariseBillingStatCards(records: BillingStatCardRecord[]): BillingStatCards {
  const out: BillingStatCards = { ...EMPTY_CARDS }
  for (const record of records) {
    const cents = toCents(record.total)
    out.expectedCents += cents
    out.expectedCount += 1
    if (record.state === "drafted") {
      out.draftedCents += cents
      out.draftedCount += 1
      if (record.needs_attention) out.draftedDiffersCount += 1
    }
    if (record.state === "issued" || record.state === "paid") {
      out.issuedPaidCents += cents
      out.issuedPaidCount += 1
    }
    if (record.state === "overdue") {
      out.overdueCents += cents
      out.overdueCount += 1
    }
  }
  return out
}

/** Jul–Jun `YYYY-MM` list for the selected financial year. */
export function fyBillingMonthChips(fy: number): string[] {
  return billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function billingMonthChipLabel(yyyyMm: string): string {
  const month = Number(yyyyMm.slice(5, 7))
  return SHORT_MONTHS[month - 1] ?? yyyyMm
}

/**
 * Pressed chip: the applied single month, otherwise the current month when it
 * sits inside the applied range and the selected FY. A range that excludes
 * today presses nothing.
 */
export function pressedBillingMonth(
  range: { from: string; to: string },
  fy: number,
  today: Date = new Date()
): string | null {
  const months = fyBillingMonthChips(fy)
  if (range.from === range.to && months.includes(range.from)) return range.from
  const current = getCurrentBillingMonth(today)
  if (months.includes(current) && current >= range.from && current <= range.to) return current
  return null
}

const IN_XERO_WITHOUT_AMOUNT = new Set<BillingState>([
  "drafted",
  "issued",
  "issued_outside_av",
  "paid",
  "overdue",
])

export type BillingInXeroCell =
  | { kind: "amount"; text: string }
  | { kind: "in_xero"; text: "In Xero"; title: "Xero amount not loaded on this page" }
  | { kind: "absent"; text: "Not in Xero" }

/** Dollars already on the row. The invoicing overlay does not copy the Xero subtotal. */
export function xeroAmountOnBillingRecord(record: { xero_amount?: number | null }): number | null {
  const value = record.xero_amount
  if (value == null || !Number.isFinite(value)) return null
  return value
}

/**
 * In Xero column. A loaded dollar wins. Drafted, issued, issued outside AV,
 * paid and overdue are in Xero even when that dollar is not on the page.
 */
export function billingInXeroCell(
  state: BillingState | null | undefined,
  xeroDollars: number | null | undefined,
): BillingInXeroCell {
  if (xeroDollars != null && Number.isFinite(xeroDollars)) {
    return { kind: "amount", text: formatAUD(xeroDollars) }
  }
  if (state != null && IN_XERO_WITHOUT_AMOUNT.has(state)) {
    return {
      kind: "in_xero",
      text: "In Xero",
      title: "Xero amount not loaded on this page",
    }
  }
  return { kind: "absent", text: "Not in Xero" }
}

export function billingDifferencePill(
  expectedDollars: number,
  xeroDollars: number | null
): { text: string; tone: "good" | "attention" } | null {
  if (xeroDollars == null || !Number.isFinite(xeroDollars)) return null
  const delta = xeroDollars - expectedDollars
  if (Math.abs(delta) <= 1) return { text: "Matches", tone: "good" }
  const sign = delta > 0 ? "+" : "−"
  return { text: `${sign}${formatAUD(Math.abs(delta))}`, tone: "attention" }
}
