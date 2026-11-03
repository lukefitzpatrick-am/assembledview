/**
 * M8 (B21, switch `partial_mba_billing_guard`): billing vs delivery in a
 * partial MBA's selected months.
 *
 * A partial MBA bills the billing months (hand edits and Prebill included).
 * Delivery can sit in other months: a Prebill into an earlier month, a
 * hand-moved month, or client pays for media (billing media is $0 by design,
 * C-95). This lists every selected month and approved line where the two
 * differ by a cent or more, so the planner sees it before publishing. Client
 * pays lines are marked expected (decision Q12). Lines of a channel added
 * after an old partial MBA was set load approved (Q10) and are always listed.
 *
 * Warn only. Pure. Media only (fee follows its own fee months).
 */

import { formatMoney } from "@/lib/format/money"
import { fromCents, toCents } from "@/lib/money"

type MonthAmount = { month: string; amount: number }

export type PartialMbaGuardLine = {
  lineItemId: string
  mediaType: string
  billingMonths: readonly MonthAmount[]
  deliveryMonths: readonly MonthAmount[]
  flags: { excluded: boolean; clientPaysForMedia: boolean }
}

export type PartialMbaGuardRow = {
  monthYear: string
  mediaType: string
  lineItemId: string
  billing: number
  delivery: number
  /** billing minus delivery. */
  difference: number
  /** Client pays for media: a difference is by design. */
  expected: boolean
}

export type PartialMbaGuardLaterAddedLine = {
  mediaType: string
  lineItemId: string
  billing: number
  delivery: number
}

export type PartialMbaGuardResult = {
  months: string[]
  rows: PartialMbaGuardRow[]
  /** Sum of billing minus delivery over rows that are not expected. */
  difference: number
  /** Same over expected (client pays) rows. */
  expectedDifference: number
  unexpectedLineCount: number
  laterAdded: PartialMbaGuardLaterAddedLine[]
}

function monthSortKey(label: string): number {
  const t = Date.parse(`1 ${label}`)
  return Number.isFinite(t) ? t : 0
}

function centsByMonth(months: readonly MonthAmount[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of months ?? []) {
    const month = String(m?.month ?? "").trim()
    if (!month) continue
    out.set(month, (out.get(month) ?? 0) + toCents(Number(m.amount) || 0))
  }
  return out
}

export function computePartialMbaBillingVsDelivery(args: {
  perLine: readonly PartialMbaGuardLine[]
  /** Selected month labels (`October 2025`). Empty: every month either side has. */
  selectedMonthYears: readonly string[]
  /** Channels an old partial MBA doesn't list (from `reconcileLegacyPartialSelection`). */
  laterAddedMediaKeys?: readonly string[]
}): PartialMbaGuardResult {
  const approved = args.perLine.filter((l) => !l.flags.excluded)
  let months = [...new Set(args.selectedMonthYears.map((m) => String(m).trim()).filter(Boolean))]
  if (months.length === 0) {
    const all = new Set<string>()
    for (const l of approved) {
      for (const m of [...l.billingMonths, ...l.deliveryMonths]) all.add(String(m.month).trim())
    }
    months = [...all].filter(Boolean)
  }
  months.sort((a, b) => monthSortKey(a) - monthSortKey(b))
  const laterAddedKeys = new Set(args.laterAddedMediaKeys ?? [])

  const rows: PartialMbaGuardRow[] = []
  const laterAdded: PartialMbaGuardLaterAddedLine[] = []
  let differenceCents = 0
  let expectedCents = 0
  const unexpectedLines = new Set<string>()

  for (const line of approved) {
    const billing = centsByMonth(line.billingMonths)
    const delivery = centsByMonth(line.deliveryMonths)
    let lineBilling = 0
    let lineDelivery = 0
    for (const month of months) {
      const b = billing.get(month) ?? 0
      const d = delivery.get(month) ?? 0
      lineBilling += b
      lineDelivery += d
      if (b === d) continue
      const expected = line.flags.clientPaysForMedia
      rows.push({
        monthYear: month,
        mediaType: line.mediaType,
        lineItemId: line.lineItemId,
        billing: fromCents(b),
        delivery: fromCents(d),
        difference: fromCents(b - d),
        expected,
      })
      if (expected) expectedCents += b - d
      else {
        differenceCents += b - d
        unexpectedLines.add(line.lineItemId)
      }
    }
    if (laterAddedKeys.has(line.mediaType)) {
      laterAdded.push({
        mediaType: line.mediaType,
        lineItemId: line.lineItemId,
        billing: fromCents(lineBilling),
        delivery: fromCents(lineDelivery),
      })
    }
  }

  const monthIndex = new Map(months.map((m, i) => [m, i]))
  rows.sort((a, b) => (monthIndex.get(a.monthYear) ?? 0) - (monthIndex.get(b.monthYear) ?? 0))

  return {
    months,
    rows,
    difference: fromCents(differenceCents),
    expectedDifference: fromCents(expectedCents),
    unexpectedLineCount: unexpectedLines.size,
    laterAdded,
  }
}

/** True when the guard has anything to show. */
export function partialMbaGuardHasFindings(result: PartialMbaGuardResult): boolean {
  return result.rows.length > 0 || result.laterAdded.length > 0
}

/** One line for the save rail, or null. */
export function describePartialMbaGuardRail(result: PartialMbaGuardResult): string | null {
  const parts: string[] = []
  if (result.unexpectedLineCount > 0) {
    const lines = result.unexpectedLineCount === 1 ? "1 line" : `${result.unexpectedLineCount} lines`
    parts.push(
      Math.abs(result.difference) >= 0.005
        ? `Billing is ${formatMoney(Math.abs(result.difference))} ${result.difference > 0 ? "above" : "below"} delivery on ${lines} in the MBA months.`
        : `Billing and delivery timing differ on ${lines} in the MBA months. The totals match.`
    )
  }
  if (result.laterAdded.length > 0) {
    const lines = result.laterAdded.length === 1 ? "1 line" : `${result.laterAdded.length} lines`
    parts.push(`${lines} added after the partial MBA was set ${result.laterAdded.length === 1 ? "is" : "are"} in it.`)
  }
  if (parts.length === 0) return null
  return `${parts.join(" ")} See MBA & billing.`
}
