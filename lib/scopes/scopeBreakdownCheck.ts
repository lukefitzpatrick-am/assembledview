/**
 * Non-blocking check: do the scope's cost (task) lines total the same as its
 * billing schedule? `cost` has no fixed meaning (some scopes store a monthly
 * cost), so callers show a warning only and never block a save.
 *
 * Pure, so a finance review screen can reuse it.
 */

import { roundMoney2 } from "@/lib/money"
import { coerceMoney } from "@/lib/scopes/scopeForm"

export type ScopeBreakdownInput = {
  cost?: unknown
  billing_schedule?: unknown
  billingSchedule?: unknown
}

export type ScopeBreakdownCheckResult = {
  /** Sum of `cost[].cost` (task lines). */
  costTotal: number
  /** Sum of `billing_schedule[].cost` (flat schedule rows). */
  scheduleTotal: number
  /** costTotal - scheduleTotal, rounded to cents. */
  difference: number
  /** True when the two totals agree to the cent. */
  matches: boolean
  /** Warning text when the totals differ, else null. */
  warning: string | null
}

function parseJsonish(val: unknown): unknown {
  if (typeof val !== "string") return val
  try {
    return JSON.parse(val) as unknown
  } catch {
    return null
  }
}

function sumField(rows: unknown, field: "cost"): number {
  const parsed = parseJsonish(rows)
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { months?: unknown }).months)
      ? (parsed as { months: unknown[] }).months
      : []
  let total = 0
  for (const row of list) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    total += coerceMoney(r[field] ?? r.amount)
  }
  return roundMoney2(total)
}

function aud(n: number): string {
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  return `${sign}$${abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function scopeBreakdownCheck(scope: ScopeBreakdownInput): ScopeBreakdownCheckResult {
  const costTotal = sumField(scope.cost, "cost")
  const scheduleTotal = sumField(scope.billing_schedule ?? scope.billingSchedule, "cost")
  const difference = roundMoney2(costTotal - scheduleTotal)
  const matches = Math.abs(difference) < 0.005
  return {
    costTotal,
    scheduleTotal,
    difference,
    matches,
    warning: matches
      ? null
      : `Cost lines total ${aud(costTotal)} but the billing schedule totals ${aud(scheduleTotal)}. Check before invoicing.`,
  }
}
