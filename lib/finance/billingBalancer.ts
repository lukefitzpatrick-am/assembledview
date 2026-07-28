/**
 * Plan C S2b — balancer math for manual billing timing.
 *
 * Exactly one month per line is the balancer: amount = lineTotal − Σ(other months).
 * Cent residue from even distribution lands on the balancer month.
 */

import { roundMoney2 } from "@/lib/format/money"
import type { MonthAmount } from "@/lib/finance/campaignFinancials.types"
import { MANUAL_MEDIA_SUM_TOLERANCE, validateManualMediaMonthsSum } from "@/lib/finance/manualBillingOverridesUi"

export type MonthAmountWithOptionalSource = MonthAmount & {
  /** Persisted on billing_overrides.months[] when balancer is used. */
  source?: "auto" | "manual" | "balancing"
}

/**
 * Default balancer = last month (by calendar order) that has a non-zero auto amount.
 * Falls back to the last month in the list.
 */
export function pickDefaultBalancerMonth(args: {
  monthYears: string[]
  /** Auto / reference amount per monthYear (schedule labels). */
  autoAmountByMonth: Record<string, number>
}): string | null {
  const { monthYears, autoAmountByMonth } = args
  if (monthYears.length === 0) return null
  for (let i = monthYears.length - 1; i >= 0; i--) {
    const my = monthYears[i]!
    const auto = Number(autoAmountByMonth[my] ?? 0)
    if (Number.isFinite(auto) && Math.abs(auto) > 0.005) return my
  }
  return monthYears[monthYears.length - 1] ?? null
}

/** Balancer amount = line total − sum of every other month (rounded to cents). */
export function computeBalancerAmount(args: {
  lineTotal: number
  amountsByMonth: Record<string, number>
  balancerMonth: string
}): number {
  const { lineTotal, amountsByMonth, balancerMonth } = args
  let others = 0
  for (const [month, raw] of Object.entries(amountsByMonth)) {
    if (month === balancerMonth) continue
    others += Number(raw) || 0
  }
  return roundMoney2(lineTotal - others)
}

/**
 * Distribute `lineTotal` evenly across months; leftover cents go to `balancerMonth`
 * so the vector always sums to lineTotal within tolerance.
 */
export function distributeEvenlyWithBalancer(args: {
  lineTotal: number
  monthYears: string[]
  balancerMonth: string
}): Record<string, number> {
  const { lineTotal, monthYears, balancerMonth } = args
  const n = monthYears.length
  const out: Record<string, number> = {}
  if (n === 0) return out
  if (n === 1) {
    out[monthYears[0]!] = roundMoney2(lineTotal)
    return out
  }

  const totalCents = Math.round(roundMoney2(lineTotal) * 100)
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n

  for (const m of monthYears) {
    out[m] = base / 100
  }
  // Leftover cents land on the balancer so the vector always sums to lineTotal.
  out[balancerMonth] = (base + remainder) / 100
  return out
}

/**
 * Keep shape + delta: preserved manual months stay exact; the residual
 * (newLineTotal − Σ preserved) lands on the balancer month.
 * Months present only on the new auto schedule (not in preserved) start at 0
 * unless they are the balancer.
 */
export function applyKeepShapePlusDelta(args: {
  /** Prior override months (ISO `YYYY-MM` or schedule labels — caller normalises). */
  preservedMonths: MonthAmount[]
  /** New auto schedule months for the line (same month key space as preserved). */
  newAutoMonths: MonthAmount[]
  /** Month key that receives the residual (must be in the union of month keys). */
  balancerMonth: string
  newLineTotal: number
}): MonthAmountWithOptionalSource[] {
  const { preservedMonths, newAutoMonths, balancerMonth, newLineTotal } = args
  const preserved = new Map(
    preservedMonths.map((m) => [String(m.month).trim(), roundMoney2(Number(m.amount) || 0)])
  )
  const monthKeys = [
    ...new Set([
      ...preservedMonths.map((m) => String(m.month).trim()),
      ...newAutoMonths.map((m) => String(m.month).trim()),
    ]),
  ]
    .filter(Boolean)
    .sort()

  if (monthKeys.length === 0) {
    return [
      {
        month: balancerMonth,
        amount: roundMoney2(newLineTotal),
        source: "balancing",
      },
    ]
  }

  const keys = monthKeys.includes(balancerMonth)
    ? monthKeys
    : [...monthKeys, balancerMonth].sort()

  const amounts: Record<string, number> = {}
  for (const k of keys) {
    if (k === balancerMonth) continue
    amounts[k] = preserved.has(k) ? preserved.get(k)! : 0
  }
  amounts[balancerMonth] = computeBalancerAmount({
    lineTotal: newLineTotal,
    amountsByMonth: amounts,
    balancerMonth,
  })

  return keys.map((month) => ({
    month,
    amount: roundMoney2(amounts[month] ?? 0),
    source: month === balancerMonth ? ("balancing" as const) : ("manual" as const),
  }))
}

/** True when months sum to expected (same gate as persist). */
export function keepShapePlusDeltaPassesSumGate(
  months: MonthAmount[],
  expectedMediaTotal: number
): boolean {
  return validateManualMediaMonthsSum(months, expectedMediaTotal).ok
}

export function isNegativeBalancer(amount: number): boolean {
  return amount < -MANUAL_MEDIA_SUM_TOLERANCE
}
