import { differenceInCalendarDays, max as dfMax, min as dfMin, parseISO, startOfDay } from "date-fns"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

export type LineItemPacingDerived = {
  budget: number
  spend: number
  expected: number
  pctOfBudget: number | null
  dailyPace: number
  requiredDaily: number
  projectedTotal: number
  /** Versus expected spend to date (fallback: spend vs budget). */
  variancePct: number | null
  /** Projected total spend at flight end vs budget. */
  varianceVsBudgetPct: number | null
}

export function computeLineItemPacingDerived(
  row: LineItemPacingRow,
  filterDateTo: string
): LineItemPacingDerived {
  const budget = Number(row.budget_amount ?? 0)
  const spend = Number(row.spend_amount ?? 0)
  const expected = Number(row.expected_spend ?? 0)
  const pctOfBudget = budget > 0 ? (spend / budget) * 100 : null

  const start = row.start_date
    ? parseISO(`${row.start_date.trim().slice(0, 10)}T12:00:00`)
    : null
  const end = row.end_date ? parseISO(`${row.end_date.trim().slice(0, 10)}T12:00:00`) : null
  let asOf = parseISO(`${filterDateTo.trim().slice(0, 10)}T12:00:00`)
  const today = startOfDay(new Date())
  if (Number.isNaN(asOf.getTime())) asOf = today

  asOf = dfMin([asOf, today])
  if (end && !Number.isNaN(end.getTime())) asOf = dfMin([asOf, end])
  if (start && !Number.isNaN(start.getTime())) asOf = dfMax([asOf, start])

  const daysTotal =
    start &&
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    differenceInCalendarDays(end, start) >= 0
      ? Math.max(1, differenceInCalendarDays(end, start) + 1)
      : 1

  const daysElapsed =
    start && !Number.isNaN(start.getTime()) && !Number.isNaN(asOf.getTime())
      ? Math.max(1, differenceInCalendarDays(asOf, start) + 1)
      : 1

  const dailyPace = spend / daysElapsed

  const daysRemaining =
    end && !Number.isNaN(end.getTime()) && !Number.isNaN(asOf.getTime())
      ? Math.max(0, differenceInCalendarDays(end, asOf))
      : 0

  const requiredDaily = daysRemaining > 0 ? Math.max(0, budget - spend) / daysRemaining : 0

  const projectedTotal =
    daysElapsed > 0 && daysTotal > 0 ? (spend * daysTotal) / daysElapsed : spend

  const variancePct =
    expected > 0
      ? ((spend - expected) / expected) * 100
      : budget > 0
        ? ((spend - budget) / budget) * 100
        : null

  const varianceVsBudgetPct = budget > 0 ? ((projectedTotal - budget) / budget) * 100 : null

  return {
    budget,
    spend,
    expected,
    pctOfBudget,
    dailyPace,
    requiredDaily,
    projectedTotal,
    variancePct,
    varianceVsBudgetPct,
  }
}

export function normalizePacingStatusKey(raw: string | null | undefined): string {
  return String(raw ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

const AT_RISK = new Set(["under_pacing", "over_pacing", "no_delivery"])

export function isAtRiskStatus(status: string | null | undefined): boolean {
  return AT_RISK.has(normalizePacingStatusKey(status))
}
