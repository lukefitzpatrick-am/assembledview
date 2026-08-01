/**
 * PC4 — billing balancer math.
 *
 * Exactly one balancing month per line: amount = lineTotal − Σ(other months).
 * Never typed by the user. Storage stays billing_overrides (computed|override).
 */

import { roundMoney2 } from "@/lib/format/money"

export type MonthAmountPair = {
  /** Schedule monthYear ("January 2026") or ISO ("2026-01"). */
  month: string
  amount: number
}

export type BalancerState = {
  months: MonthAmountPair[]
  /** Month key of the balancer (same string form as months[].month). */
  balancingMonth: string
  lineTotal: number
}

export type BalancerResult = {
  months: MonthAmountPair[]
  balancingMonth: string
  balancingAmount: number
  /** Always true when amounts were rebuilt from this helper. */
  reconciles: boolean
  negativeBalancer: boolean
  footerLabel: string
}

function keyOf(m: string): string {
  return String(m ?? "").trim()
}

function money(n: number): number {
  return roundMoney2(Number.isFinite(n) ? n : 0)
}

/** Pick default balancer = last month in the list (stable sort by key). */
export function defaultBalancingMonth(months: readonly string[]): string {
  const keys = [...months].map(keyOf).filter(Boolean)
  if (keys.length === 0) return ""
  return keys[keys.length - 1]!
}

/**
 * Rebuild amounts so the balancing month absorbs the residue.
 * Non-balancer months keep their typed values; balancer is computed.
 */
export function applyBalancer(state: BalancerState): BalancerResult {
  const balancingMonth = keyOf(state.balancingMonth) || defaultBalancingMonth(state.months.map((m) => m.month))
  const lineTotal = money(state.lineTotal)

  let others = 0
  const next: MonthAmountPair[] = state.months.map((m) => {
    const month = keyOf(m.month)
    if (month === balancingMonth) {
      return { month, amount: 0 }
    }
    const amount = money(m.amount)
    others = money(others + amount)
    return { month, amount }
  })

  const balancingAmount = money(lineTotal - others)
  const months = next.map((m) =>
    m.month === balancingMonth ? { month: m.month, amount: balancingAmount } : m
  )

  const sum = money(months.reduce((s, m) => s + m.amount, 0))
  const reconciles = Math.abs(sum - lineTotal) < 0.005
  const negativeBalancer = balancingAmount < -0.005

  return {
    months,
    balancingMonth,
    balancingAmount,
    reconciles,
    negativeBalancer,
    footerLabel: `Months $${sum.toFixed(2)} / line $${lineTotal.toFixed(2)} ✓`,
  }
}

/** Move the balancer to `newBalancingMonth`, preserving non-balancer typed amounts. */
export function reassignBalancer(
  state: BalancerState,
  newBalancingMonth: string
): BalancerResult {
  return applyBalancer({
    ...state,
    balancingMonth: keyOf(newBalancingMonth) || state.balancingMonth,
  })
}

/**
 * Distribute lineTotal evenly across months; cent residue lands on the balancer.
 * Example: $100 / 3 → 33.33, 33.33, 33.34 (balancer last or designated).
 */
export function distributeEvenly(state: BalancerState): BalancerResult {
  const keys = state.months.map((m) => keyOf(m.month)).filter(Boolean)
  const n = keys.length
  if (n === 0) {
    return applyBalancer(state)
  }
  const balancingMonth = keyOf(state.balancingMonth) || defaultBalancingMonth(keys)
  const lineTotal = money(state.lineTotal)
  const cents = Math.round(lineTotal * 100)
  const base = Math.floor(cents / n)
  let remainder = cents - base * n

  const byMonth = new Map<string, number>()
  for (const month of keys) {
    byMonth.set(month, base / 100)
  }
  // Put whole-cent residue on the balancer first, then walk others if needed.
  const order = [balancingMonth, ...keys.filter((k) => k !== balancingMonth)]
  for (const month of order) {
    if (remainder <= 0) break
    byMonth.set(month, money((byMonth.get(month) ?? 0) + 0.01))
    remainder -= 1
  }

  const months = keys.map((month) => ({
    month,
    amount: money(byMonth.get(month) ?? 0),
  }))

  // Final enforce via applyBalancer so footer is exact even if float noise.
  return applyBalancer({ months, balancingMonth, lineTotal })
}

/** Reset typed months to auto amounts then re-apply balancer (or pure auto if empty). */
export function resetToAuto(args: {
  autoMonths: MonthAmountPair[]
  balancingMonth?: string
  lineTotal: number
}): BalancerResult {
  const balancingMonth =
    keyOf(args.balancingMonth ?? "") ||
    defaultBalancingMonth(args.autoMonths.map((m) => m.month))
  return applyBalancer({
    months: args.autoMonths.map((m) => ({ month: keyOf(m.month), amount: money(m.amount) })),
    balancingMonth,
    lineTotal: money(args.lineTotal),
  })
}

/**
 * When flight dates shrink, move amounts whose months fall outside the new span
 * into the balancing month (shown before confirm on DateBasis keep).
 */
export function reanchorOutOfSpanToBalancer(args: {
  months: MonthAmountPair[]
  allowedMonths: readonly string[]
  balancingMonth?: string
  lineTotal: number
}): {
  preview: BalancerResult
  movedFrom: string[]
} {
  const allowed = new Set([...args.allowedMonths].map(keyOf).filter(Boolean))
  const balancingMonth =
    keyOf(args.balancingMonth ?? "") ||
    defaultBalancingMonth([...allowed]) ||
    defaultBalancingMonth(args.months.map((m) => m.month))

  const movedFrom: string[] = []
  let parked = 0
  const kept: MonthAmountPair[] = []

  for (const m of args.months) {
    const month = keyOf(m.month)
    const amount = money(m.amount)
    if (!month) continue
    if (allowed.size > 0 && !allowed.has(month) && month !== balancingMonth) {
      if (Math.abs(amount) > 0.005) movedFrom.push(month)
      parked = money(parked + amount)
      continue
    }
    kept.push({ month, amount })
  }

  // Ensure every allowed month exists (0 if missing).
  for (const month of allowed) {
    if (!kept.some((k) => k.month === month)) {
      kept.push({ month, amount: 0 })
    }
  }
  if (!kept.some((k) => k.month === balancingMonth)) {
    kept.push({ month: balancingMonth, amount: 0 })
  }

  // Fold parked into current balancer slot before applyBalancer.
  const withParked = kept.map((k) =>
    k.month === balancingMonth ? { ...k, amount: money(k.amount + parked) } : k
  )

  return {
    preview: applyBalancer({
      months: withParked,
      balancingMonth,
      lineTotal: money(args.lineTotal),
    }),
    movedFrom: [...new Set(movedFrom)].sort(),
  }
}

export function isBillingBalancerEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_BILLING_BALANCER ?? "off").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true"
}
