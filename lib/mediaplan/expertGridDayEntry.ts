import { expertCellBudget } from "@/lib/mediaplan/expertChannelMappings"
import { netFromGross } from "@/lib/mediaplan/deliverableBudget"
import type { ExpertDailyValues } from "@/lib/mediaplan/expertDayModel"
import { weekKeysInSpanInclusive } from "@/lib/mediaplan/expertGridShared"
import type { ExpertWeeklyValues } from "@/lib/mediaplan/expertModeWeeklySchedule"

/**
 * Shared helpers for the expert-grid day-detail render (model-tier Phase 2)
 * and the budget/deliverables entry-mode toggle. One implementation for all
 * 18 channel grids — grids import from here rather than carrying copies.
 */

/** Fixed pixel width of one expanded day sub-column. */
export const DAY_COL_WIDTH_PX = 44

/** Grid entry mode: cells always STORE deliverables; budget mode only converts at the input/display layer. */
export type GridEntryMode = "deliverables" | "budget"

/** Minimal row shape needed by {@link clearConflictingDayDetail}. */
export type DayDetailRowFields = {
  weeklyValues: ExpertWeeklyValues
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: ReadonlyArray<{
    startWeekKey: string
    endWeekKey: string
  }>
}

/**
 * The row's fee basis for its $ cells. V66 B: a $ cell shows and takes the
 * line's budget (gross on a fee-inclusive line), the same money as the card.
 */
export type BudgetCellFees = { budgetIncludesFees: boolean; feePct: number }

/**
 * Inverse of {@link budgetCellDisplay}: $ typed in budget mode → deliverable
 * qty. The budget is gross on a fee-inclusive line, so the deliverables are
 * what its net buys (the card's rule); fixed cost and package rates are the
 * budget already.
 */
export function qtyFromBudgetInput(
  buyType: string | null | undefined,
  unitRate: number,
  budget: number,
  fees: BudgetCellFees
): number {
  if (!Number.isFinite(budget)) return 0
  if (!Number.isFinite(unitRate) || unitRate === 0) return 0
  const bt = String(buyType || "").toLowerCase()
  const media =
    bt === "fixed_cost" || bt === "package"
      ? budget
      : netFromGross(budget, fees.budgetIncludesFees, fees.feePct)
  if (bt === "cpm") return (media / unitRate) * 1000
  return media / unitRate
}

/** Rate-less buy types cannot take budget entry (no conversion exists). */
export function rowSupportsBudgetEntry(
  buyType: string | null | undefined,
  unitRate: number
): boolean {
  const bt = String(buyType || "").toLowerCase()
  if (bt === "bonus" || bt === "package_inclusions") return false
  return Number.isFinite(unitRate) && unitRate > 0
}

/**
 * Cell display for budget mode: the cell's budget, 2dp (qty × rate, grossed
 * up on a fee-inclusive line). shortcut: a cell shows qty × the row's rate,
 * so an untouched burst with its own rate or a budget that is not a whole
 * multiple of the rate shows a few cents or its rate's difference here while
 * the row's Net Media, the footer and Apply use the saved budget; upgrade by
 * reading `expertCarry` per cell if planners need the cells exact too.
 */
export function budgetCellDisplay(
  buyType: string | null | undefined,
  unitRate: number,
  qty: number,
  fees: BudgetCellFees
): string {
  if (!Number.isFinite(qty) || qty === 0) return ""
  const cost = expertCellBudget(buyType, unitRate, qty, fees.budgetIncludesFees, fees.feePct)
  if (!Number.isFinite(cost) || cost === 0) return ""
  return (Math.round(cost * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/**
 * Invariant enforcement (single chokepoint, applied on every pushRows): a
 * week-level value wins over day-level detail. If a week's cell is non-empty
 * or the week is covered by a merged span, that week's day keys are dropped
 * from `dailyValues`. Rows without conflicts are returned unchanged so
 * untouched plans stay byte-identical through save baselines.
 */
export function clearConflictingDayDetail<R extends DayDetailRowFields>(
  row: R,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  weekKeys: readonly string[]
): R {
  const daily = row.dailyValues
  if (!daily || Object.keys(daily).length === 0) return row
  const spanCovered = new Set<string>()
  for (const span of row.mergedWeekSpans ?? []) {
    for (const k of weekKeysInSpanInclusive(
      weekKeys,
      span.startWeekKey,
      span.endWeekKey
    )) {
      spanCovered.add(k)
    }
  }
  let changed = false
  const nextDaily = { ...daily }
  for (const weekKey of weekKeys) {
    const dayKeys = dayKeysByWeekKey[weekKey] ?? []
    if (!dayKeys.some((k) => nextDaily[k] !== undefined)) continue
    const cell = row.weeklyValues[weekKey]
    const weekLevelWins =
      spanCovered.has(weekKey) ||
      (cell !== "" && cell !== undefined && cell !== null)
    if (!weekLevelWins) continue
    for (const k of dayKeys) {
      if (nextDaily[k] !== undefined) {
        delete nextDaily[k]
        changed = true
      }
    }
  }
  if (!changed) return row
  if (Object.keys(nextDaily).length === 0) {
    const { dailyValues: _omit, ...rest } = row
    return rest as R
  }
  return { ...row, dailyValues: nextDaily }
}
