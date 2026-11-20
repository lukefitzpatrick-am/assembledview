import { expertCellBudget, expertRowRawCost } from "@/lib/mediaplan/expertChannelMappings"
import { carriedMoney, weekKeyOfDay, type ExpertCarry } from "@/lib/mediaplan/expertCarry"
import type { ExpertDailyValues } from "@/lib/mediaplan/expertDayModel"
import {
  expertGridParseNum,
  expertRowFeeSplit,
} from "@/lib/mediaplan/expertGridShared"
import type { ExpertWeeklyValues } from "@/lib/mediaplan/expertModeWeeklySchedule"

export type ExpertRowCostFields = {
  buyType?: string | null
  unitRate?: string | number | null
  weeklyValues: ExpertWeeklyValues
  /**
   * Opportunistic day-level detail. Invariant: a day-detailed week's weekly
   * cell is "" (empty), so summing all day values alongside weekly cells
   * never double-counts.
   */
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: ReadonlyArray<{ startWeekKey: string; endWeekKey: string; totalQty?: number }>
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
  /** What Apply writes back for cells the planner has not touched (`expertCarry.ts`). */
  expertCarry?: ExpertCarry
}

/** Σ weekly + day-detail + merged quantity. */
export function expertRowQuantitySum(
  row: ExpertRowCostFields,
  weekKeys: readonly string[]
): number {
  const weekly = weekKeys.reduce(
    (s, k) => s + expertGridParseNum(row.weeklyValues[k]),
    0
  )
  const daily = row.dailyValues
    ? Object.values(row.dailyValues).reduce<number>(
        (s, v) => s + expertGridParseNum(v),
        0
      )
    : 0
  const merged = (row.mergedWeekSpans ?? []).reduce(
    (s, sp) => s + (Number.isFinite(sp.totalQty) ? (sp.totalQty as number) : 0),
    0
  )
  return weekly + daily + merged
}

/**
 * Σ quantity × rate, before any fee. The lump-sum projection on open compares
 * it with the card; the grid's money columns read {@link expertRowBudget}.
 */
export function expertRowGrossCost(
  row: ExpertRowCostFields,
  weekKeys: readonly string[]
): number {
  const rate = expertGridParseNum(row.unitRate)
  const qty = expertRowQuantitySum(row, weekKeys)
  return expertRowRawCost(row.buyType, rate, qty)
}

/** Σ quantity outside the given week columns (weeks, their days, and spans that start there). */
function quantityOutside(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  skip: ReadonlySet<string>
): number {
  let q = 0
  for (const k of weekKeys) if (!skip.has(k)) q += expertGridParseNum(row.weeklyValues[k])
  for (const [d, v] of Object.entries(row.dailyValues ?? {})) {
    const k = weekKeyOfDay(d, weekKeys)
    if (k === undefined || !skip.has(k)) q += expertGridParseNum(v)
  }
  for (const sp of row.mergedWeekSpans ?? []) {
    if (!skip.has(sp.startWeekKey) && Number.isFinite(sp.totalQty)) q += sp.totalQty as number
  }
  return q
}

/**
 * V66 B: the row's budget, what Apply will save. Cells the planner has not
 * touched carry their saved budgets; the rest is Σ quantity × rate, grossed
 * up on a fee-inclusive line ({@link expertCellBudget}).
 */
export function expertRowBudget(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  feePct: number
): number {
  const rate = expertGridParseNum(row.unitRate)
  const carried = carriedMoney(row, weekKeys)
  const qty =
    carried.weekKeys.size > 0
      ? quantityOutside(row, weekKeys, carried.weekKeys)
      : expertRowQuantitySum(row, weekKeys)
  // C-370: a row whose only money is bursts the grid cannot place shows just that.
  if ((carried.weekKeys.size > 0 || (row.expertCarry?.unplaced.length ?? 0) > 0) && qty === 0) return carried.budget
  return (
    carried.budget +
    expertCellBudget(row.buyType, rate, qty, !!row.budgetIncludesFees, feePct)
  )
}

/** Net media $ after fee split. */
export function expertRowNetMedia(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  feePct: number
): number {
  const raw = expertRowBudget(row, weekKeys, feePct)
  return expertRowFeeSplit(
    raw,
    !!row.budgetIncludesFees,
    feePct,
    !!row.clientPaysForMedia,
    row.buyType ?? undefined
  ).net
}

/** Raw + net + fee in one pass (for containerTotals). */
export function expertRowCostSplit(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  feePct: number
): { raw: number; net: number; fee: number } {
  const raw = expertRowBudget(row, weekKeys, feePct)
  const { net, fee } = expertRowFeeSplit(
    raw,
    !!row.budgetIncludesFees,
    feePct,
    !!row.clientPaysForMedia,
    row.buyType ?? undefined
  )
  return { raw, net, fee }
}

/** Net-media column tooltip. */
export function expertRowNetMediaTooltip(
  row: ExpertRowCostFields,
  qtySum: number
): string {
  const bt = String(row.buyType || "").toLowerCase()
  const rate = expertGridParseNum(row.unitRate)
  if (bt === "bonus") return "Bonus: net media = 0"
  if (bt === "cpm")
    return `CPM: (Σ qty / 1000) × rate (${qtySum} / 1000 × ${rate})`
  return `Σ qty × rate (${qtySum} × ${rate})`
}

type RowDerivedCacheEntry = {
  weekKeys: readonly string[]
  feePct: number
  qtySum: number
  net: number
}

/**
 * Identity-keyed memo for Σqty + net media. Unchanged row object references
 * reuse prior derived values so sibling cell edits stay O(1) per dirty row.
 */
export function createExpertRowDerivedCache() {
  const map = new WeakMap<object, RowDerivedCacheEntry>()
  return {
    qtySum(row: ExpertRowCostFields, weekKeys: readonly string[]): number {
      const prev = map.get(row as object)
      if (prev && prev.weekKeys === weekKeys) return prev.qtySum
      const qtySum = expertRowQuantitySum(row, weekKeys)
      map.set(row as object, {
        weekKeys,
        feePct: Number.NaN,
        qtySum,
        net: Number.NaN,
      })
      return qtySum
    },
    netMedia(
      row: ExpertRowCostFields,
      weekKeys: readonly string[],
      feePct: number
    ): number {
      const prev = map.get(row as object)
      if (
        prev &&
        prev.weekKeys === weekKeys &&
        prev.feePct === feePct &&
        Number.isFinite(prev.net)
      ) {
        return prev.net
      }
      const qtySum =
        prev && prev.weekKeys === weekKeys
          ? prev.qtySum
          : expertRowQuantitySum(row, weekKeys)
      const net = expertRowNetMedia(row, weekKeys, feePct)
      map.set(row as object, { weekKeys, feePct, qtySum, net })
      return net
    },
  }
}

type ExpertRowDerivedCache = ReturnType<typeof createExpertRowDerivedCache>
