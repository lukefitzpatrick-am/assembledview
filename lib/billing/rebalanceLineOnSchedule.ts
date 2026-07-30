/**
 * PC4 — apply balancer amounts onto a BillingMonth[] schedule for one line.
 */

import {
  applyBalancer,
  defaultBalancingMonth,
  type MonthAmountPair,
} from "@/lib/billing/balancer"
import { syncLineItemMonthlyAmountAcrossAllMonthRows } from "@/lib/billing/syncLineItemAmountAcrossMonthRows"
import { recalculateBillingMonths } from "@/lib/billing/recalculateBillingMonths"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { roundMoney2 } from "@/lib/format/money"

const balancingMonthByLine = new Map<string, string>()

export function getLineBalancingMonth(lineItemId: string, monthYears: string[]): string {
  const id = String(lineItemId ?? "").trim()
  const existing = balancingMonthByLine.get(id)
  if (existing && monthYears.includes(existing)) return existing
  const d = defaultBalancingMonth(monthYears)
  if (id && d) balancingMonthByLine.set(id, d)
  return d
}

export function setLineBalancingMonth(lineItemId: string, monthYear: string): void {
  const id = String(lineItemId ?? "").trim()
  if (id && monthYear) balancingMonthByLine.set(id, monthYear)
}

function findMediaKey(months: BillingMonth[], lineItemId: string): string | null {
  for (const m of months) {
    if (!m.lineItems) continue
    for (const [key, items] of Object.entries(m.lineItems)) {
      if ((items as BillingLineItem[] | undefined)?.some((li) => li.id === lineItemId)) {
        return key
      }
    }
  }
  return null
}

function lineTotalAcrossMonths(months: BillingMonth[], lineItemId: string): number {
  let sum = 0
  for (const m of months) {
    if (!m.lineItems) continue
    for (const items of Object.values(m.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const li of items as BillingLineItem[]) {
        if (li.id !== lineItemId) continue
        sum += Number(li.monthlyAmounts?.[m.monthYear] ?? 0) || 0
      }
    }
  }
  return roundMoney2(sum)
}

/**
 * After a typed edit (or reassign), force the balancing month to absorb residue
 * so the line always reconciles. Mutates a deep copy and returns it.
 */
export function rebalanceLineOnSchedule(args: {
  months: BillingMonth[]
  lineItemId: string
  /** Optional explicit line total; default = current sum (pre-balancer typed state). */
  lineTotal?: number
  balancingMonth?: string
  clientPaysForMedia?: boolean
}): BillingMonth[] {
  const copy = JSON.parse(JSON.stringify(args.months)) as BillingMonth[]
  const mediaKey = findMediaKey(copy, args.lineItemId)
  if (!mediaKey) return args.months

  const monthYears = copy.map((m) => m.monthYear)
  const balancingMonth =
    args.balancingMonth || getLineBalancingMonth(args.lineItemId, monthYears)
  setLineBalancingMonth(args.lineItemId, balancingMonth)

  const pairs: MonthAmountPair[] = copy.map((m) => {
    let amount = 0
    const items = m.lineItems?.[mediaKey as keyof typeof m.lineItems] as
      | BillingLineItem[]
      | undefined
    const li = items?.find((x) => x.id === args.lineItemId)
    amount = Number(li?.monthlyAmounts?.[m.monthYear] ?? 0) || 0
    return { month: m.monthYear, amount }
  })

  const lineTotal = args.clientPaysForMedia
    ? 0
    : args.lineTotal != null
      ? roundMoney2(args.lineTotal)
      : lineTotalAcrossMonths(copy, args.lineItemId)

  const result = applyBalancer({
    months: pairs,
    balancingMonth,
    lineTotal,
  })

  for (const m of result.months) {
    syncLineItemMonthlyAmountAcrossAllMonthRows(
      copy,
      mediaKey,
      args.lineItemId,
      m.month,
      m.amount
    )
  }
  recalculateBillingMonths(copy)
  return copy
}

export function collectLineMonthPairs(
  months: BillingMonth[],
  lineItemId: string
): MonthAmountPair[] {
  const mediaKey = findMediaKey(months, lineItemId)
  if (!mediaKey) return []
  return months.map((m) => {
    const items = m.lineItems?.[mediaKey as keyof typeof m.lineItems] as
      | BillingLineItem[]
      | undefined
    const li = items?.find((x) => x.id === lineItemId)
    return {
      month: m.monthYear,
      amount: Number(li?.monthlyAmounts?.[m.monthYear] ?? 0) || 0,
    }
  })
}
