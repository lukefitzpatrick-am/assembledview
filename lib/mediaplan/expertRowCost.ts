import { expertRowRawCost } from "@/lib/mediaplan/expertChannelMappings"
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
  mergedWeekSpans?: ReadonlyArray<{ totalQty?: number }>
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
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

/** Gross media $ before fee split. */
export function expertRowGrossCost(
  row: ExpertRowCostFields,
  weekKeys: readonly string[]
): number {
  const rate = expertGridParseNum(row.unitRate)
  const qty = expertRowQuantitySum(row, weekKeys)
  return expertRowRawCost(row.buyType, rate, qty)
}

/** Net media $ after fee split. */
export function expertRowNetMedia(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  feePct: number
): number {
  const raw = expertRowGrossCost(row, weekKeys)
  return expertRowFeeSplit(
    raw,
    !!row.budgetIncludesFees,
    feePct,
    !!row.clientPaysForMedia
  ).net
}

/** Raw + net + fee in one pass (for containerTotals). */
export function expertRowCostSplit(
  row: ExpertRowCostFields,
  weekKeys: readonly string[],
  feePct: number
): { raw: number; net: number; fee: number } {
  const raw = expertRowGrossCost(row, weekKeys)
  const { net, fee } = expertRowFeeSplit(
    raw,
    !!row.budgetIncludesFees,
    feePct,
    !!row.clientPaysForMedia
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
