/**
 * PC4 — collision worksheet when publish changes media totals on manual-billing lines.
 */

import { roundMoney2 } from "@/lib/format/money"
import {
  applyBalancer,
  defaultBalancingMonth,
  distributeEvenly,
  type MonthAmountPair,
} from "@/lib/billing/balancer"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

export type CollisionDecision = "keep_shape_delta" | "rescale" | "recalc_auto"

export type CollisionLineInput = {
  lineItemId: string
  label: string
  /** Prior media total the override was shaped against. */
  oldTotal: number
  /** New booked / auto media total after the edit. */
  newTotal: number
  /** Current override month amounts (schedule monthYear or ISO). */
  months: MonthAmountPair[]
  balancingMonth?: string
  clientPaysForMedia?: boolean
}

export type CollisionRow = CollisionLineInput & {
  delta: number
  /** Absolute delta above tolerance. */
  affected: boolean
}

export type CollisionChoice = {
  lineItemId: string
  decision: CollisionDecision
}

const EPS = 0.01

export function detectBillingCollisions(lines: CollisionLineInput[]): CollisionRow[] {
  const rows: CollisionRow[] = []
  for (const line of lines) {
    const oldTotal = roundMoney2(line.oldTotal)
    const newTotal = roundMoney2(line.newTotal)
    const delta = roundMoney2(newTotal - oldTotal)
    if (Math.abs(delta) < EPS) continue
    rows.push({
      ...line,
      oldTotal,
      newTotal,
      delta,
      affected: true,
    })
  }
  return rows.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
}

/**
 * Apply one collision decision → new month amounts (or null = reset to auto / clear manual).
 */
export function applyCollisionDecision(
  row: CollisionLineInput,
  decision: CollisionDecision
): { months: MonthAmountPair[] | null; balancingMonth: string } {
  const balancingMonth =
    String(row.balancingMonth ?? "").trim() ||
    defaultBalancingMonth(row.months.map((m) => m.month))

  if (decision === "recalc_auto") {
    return { months: null, balancingMonth }
  }

  if (decision === "rescale") {
    const result = distributeEvenly({
      months: row.months,
      balancingMonth,
      lineTotal: row.newTotal,
    })
    // distributeEvenly equal-weights; for true proportional rescale:
    const oldSum = roundMoney2(row.months.reduce((s, m) => s + (Number(m.amount) || 0), 0))
    if (oldSum > EPS) {
      const scaled = row.months.map((m) => ({
        month: m.month,
        amount: roundMoney2(((Number(m.amount) || 0) / oldSum) * row.newTotal),
      }))
      const balanced = applyBalancer({
        months: scaled,
        balancingMonth,
        lineTotal: row.newTotal,
      })
      return { months: balanced.months, balancingMonth }
    }
    return { months: result.months, balancingMonth }
  }

  // keep_shape_delta — keep non-balancer months; delta lands in balancer
  const balanced = applyBalancer({
    months: row.months,
    balancingMonth,
    lineTotal: row.newTotal,
  })
  return { months: balanced.months, balancingMonth }
}

export function applyBulkCollisionDecision(
  rows: CollisionLineInput[],
  decision: CollisionDecision
): Map<string, { months: MonthAmountPair[] | null; balancingMonth: string }> {
  const out = new Map<string, { months: MonthAmountPair[] | null; balancingMonth: string }>()
  for (const row of rows) {
    // MB-11: canonical key so callers can look up bare or decorated ids.
    out.set(toBillingOverrideLineItemId(row.lineItemId), applyCollisionDecision(row, decision))
  }
  return out
}
