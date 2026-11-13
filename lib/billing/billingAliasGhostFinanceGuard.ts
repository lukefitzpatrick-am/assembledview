/**
 * B35 (MB-37): the duplicate-row check where finance saves or reads a billing
 * schedule (switch `billing_ghost_row_finance_guard`).
 *
 * Same detector as the editor (`findBillingAliasGhostPairs`), with no line
 * number check: only `ML` and current ids pair here (B35 MB-40). Every live
 * pair is `ML` (113 pairs in 6 versions, 3 Nov 2026).
 *
 * - `billingScheduleAliasGhostRefusal`: the billing schedule update route
 *   refuses a client-sent schedule that holds a pair. Nothing is written.
 * - `keepCurrentRowsForAlterBilling`: Alter Billing's "Keep the current rows";
 *   `alterBillingOriginalTotal`: the total Save needs, from the schedule as opened.
 * - `invoiceDraftAliasDuplicates`: one invoice draft month; the doubled lines
 *   are flagged on the record, never dropped.
 *
 * Pure.
 */

import {
  billingAliasGhostTotal,
  describeBillingAliasGhostLines,
  findBillingAliasGhostPairs,
  removeOldAliasGhostRows,
  summariseBillingAliasGhostPairs,
  type BillingAliasGhostLine,
} from "@/lib/billing/billingAliasGhostPairs"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { BillingMonth } from "@/lib/billing/types"
import { formatMoney } from "@/lib/format/money"
import { fromCents, sumCents, toCents } from "@/lib/money"

export const BILLING_ALIAS_GHOST_ROWS_CODE = "BILLING_ALIAS_GHOST_ROWS"

export type BillingAliasGhostRefusal = {
  status: 409
  body: {
    error: string
    code: typeof BILLING_ALIAS_GHOST_ROWS_CODE
    lines: BillingAliasGhostLine[]
    /** The amount counted twice (sum of the old-id rows), ex GST. */
    doubledTotal: number
  }
}

/** Months from a sent schedule (array, `{ months }` or JSON string; saved or month shape). */
export function billingMonthsFromSentSchedule(schedule: unknown): BillingMonth[] {
  return parsePersistedBillingScheduleToMonths(schedule) ?? []
}

/** Refusal text naming each line (first five in full, then a count), or null. */
export function billingAliasGhostFinanceMessage(lines: readonly BillingAliasGhostLine[], doubledTotal: number): string | null {
  if (lines.length === 0) return null
  const described = describeBillingAliasGhostLines(lines)
  const head = described.slice(0, 5).join(". ")
  const more = described.length > 5 ? `. And ${described.length - 5} more line(s)` : ""
  return (
    `Not saved. This billing schedule holds an old line id and its current id for the same line, so ${formatMoney(doubledTotal)} is counted twice. ` +
    `${head}${more}. Open Alter Billing, choose "Keep the current rows", check the totals, then save.`
  )
}

/**
 * The 409 for a client-sent schedule that holds an old-id and current-id
 * pair with money in one month, or null when it holds none.
 */
export function billingScheduleAliasGhostRefusal(
  schedule: unknown,
  mbaNumber: string | null | undefined
): BillingAliasGhostRefusal | null {
  const months = billingMonthsFromSentSchedule(schedule)
  const pairs = findBillingAliasGhostPairs(months, mbaNumber)
  if (pairs.length === 0) return null
  const lines = summariseBillingAliasGhostPairs(pairs, months.map((m) => m.monthYear))
  const doubledTotal = billingAliasGhostTotal(pairs)
  return {
    status: 409,
    body: {
      error: billingAliasGhostFinanceMessage(lines, doubledTotal)!,
      code: BILLING_ALIAS_GHOST_ROWS_CODE,
      lines,
      doubledTotal,
    },
  }
}

/** A doubled line on one invoice draft month. */
export type InvoiceDraftAliasDuplicate = {
  mediaKey: string
  oldId: string
  currentId: string
  oldAmount: number
  currentAmount: number
}

/** The doubled lines in one schedule month (the invoice draft's month), or []. */
export function invoiceDraftAliasDuplicates(
  month: BillingMonth | null | undefined,
  mbaNumber: string | null | undefined
): InvoiceDraftAliasDuplicate[] {
  if (!month) return []
  const pairs = findBillingAliasGhostPairs([month], mbaNumber)
  return summariseBillingAliasGhostPairs(pairs).map((line) => ({
    mediaKey: line.mediaKey,
    oldId: line.oldId,
    currentId: line.currentId,
    oldAmount: line.months[0]?.oldAmount ?? 0,
    currentAmount: line.months[0]?.currentAmount ?? 0,
  }))
}

/** One line for the invoicing flag: "hema001ML4 duplicates hema001DD4 ($3.00 counted twice)". */
export function describeInvoiceDraftAliasDuplicates(dups: readonly InvoiceDraftAliasDuplicate[]): string {
  const total = fromCents(sumCents(dups.map((d) => toCents(d.oldAmount))))
  const named = dups
    .slice(0, 3)
    .map((d) => `${d.oldId} duplicates ${d.currentId}`)
    .join("; ")
  const more = dups.length > 3 ? `; and ${dups.length - 3} more` : ""
  return `Counted twice: ${named}${more} (${formatMoney(total)} too much on this invoice). Fix the plan's billing before raising it.`
}

/**
 * Alter Billing's "Keep the current rows": the months without the old-id row
 * of each pair (`removeOldAliasGhostRows`). The total Save needs is
 * `alterBillingOriginalTotal`, from the schedule as opened, so nothing here
 * moves it. `removedTotal` is the old rows' amounts as they stand in this edit
 * (information only). No pair: the input as it is.
 */
export function keepCurrentRowsForAlterBilling(
  months: readonly BillingMonth[],
  mbaNumber: string | null | undefined
): { months: BillingMonth[]; removedTotal: number } {
  const pairs = findBillingAliasGhostPairs(months, mbaNumber)
  if (pairs.length === 0) {
    return { months: months as BillingMonth[], removedTotal: 0 }
  }
  return {
    months: removeOldAliasGhostRows(months, pairs),
    removedTotal: billingAliasGhostTotal(pairs),
  }
}

/**
 * B35fix (H1): the original total Alter Billing's equal-total rule compares
 * against, taken from the schedule **as opened**, never from the rows as
 * edited.
 *
 * - The opened schedule holds no pair: the opened total, as before.
 * - It holds pairs and the edit still holds one: the opened total (Save is
 *   stopped by the pair anyway).
 * - It held pairs and the edit holds none (after "Keep the current rows", or
 *   any other edit that clears them): the opened total less the old rows'
 *   amounts as opened (`doubledAsOpened`).
 *
 * So money moved onto or off an old row before Keep is a real change and
 * fails the rule (malay004 shape: OH1 $37,000 to $20,000 and ML1 to $54,000,
 * then Keep, leaves $20,000 against $37,000). An edit that zeroes the old row
 * and moves its money onto the current row fails it too: the doubled money as
 * opened must leave the schedule.
 */
export function alterBillingOriginalTotal(params: {
  openedMonths: readonly BillingMonth[]
  currentMonths: readonly BillingMonth[]
  mbaNumber: string | null | undefined
  openedGrandTotal: number
}): { originalGrandTotal: number; doubledAsOpened: number; rebased: boolean } {
  const { openedMonths, currentMonths, mbaNumber, openedGrandTotal } = params
  const doubledAsOpened = billingAliasGhostTotal(findBillingAliasGhostPairs(openedMonths, mbaNumber))
  if (toCents(doubledAsOpened) === 0 || findBillingAliasGhostPairs(currentMonths, mbaNumber).length > 0) {
    return { originalGrandTotal: openedGrandTotal, doubledAsOpened, rebased: false }
  }
  return {
    originalGrandTotal: fromCents(toCents(openedGrandTotal) - toCents(doubledAsOpened)),
    doubledAsOpened,
    rebased: true,
  }
}
