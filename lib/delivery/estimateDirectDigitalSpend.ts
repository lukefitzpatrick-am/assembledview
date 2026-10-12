/**
 * Estimated delivered spend for CM360 direct digital
 * (digital display, digital video, digital audio, BVOD).
 *
 * Wraps `deriveSpendFromPlanRate`. Rate is planned media ÷ planned
 * deliverables, capped at planned media. Never uses buyAmount.
 * CPV prices `video3sViews` (the column TL0 named), not platform `results`.
 * Programmatic callers of `deriveSpendFromPlanRate` are unchanged.
 * Fixed-cost lines are not estimated; reported spend replaces this figure.
 */

import {
  deriveSpendFromPlanRate,
  type DeriveSpendBurstInput,
  type DeriveSpendDayInput,
} from "@/lib/delivery/deriveSpendFromPlanRate"

export const ESTIMATED_SPEND_LABEL = "Estimated spend"
export const NO_PLANNED_IMPRESSIONS = "No planned impressions"

export type DirectDigitalSpendMode = "estimated" | "actual" | "reported"

export type EstimateDirectDigitalDay = DeriveSpendDayInput & {
  video3sViews?: number
}

export type EstimateDirectDigitalSpendInput = {
  lineItemId: string
  buyType: string | null | undefined
  /** True when the line keeps the reported-spend overlay. */
  fixedCost?: boolean
  bursts: unknown
  days: ReadonlyArray<EstimateDirectDigitalDay>
}

export type EstimateDirectDigitalSpendResult = {
  amount: number | null
  spendMode: "estimated" | null
  /** Set when planned deliverables are 0. Exact copy: "No planned impressions". */
  reason: string | null
  plannedMedia: number
  days: Array<{ date: string; derivedSpend: number }>
  warnings: string[]
}

function emptyEstimate(warnings: string[] = []): EstimateDirectDigitalSpendResult {
  return {
    amount: null,
    spendMode: null,
    reason: null,
    plannedMedia: 0,
    days: [],
    warnings,
  }
}

function asBursts(raw: unknown): DeriveSpendBurstInput[] {
  let value = raw
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is DeriveSpendBurstInput => Boolean(row) && typeof row === "object",
  )
}

export function estimateDirectDigitalSpend(
  input: EstimateDirectDigitalSpendInput,
): EstimateDirectDigitalSpendResult {
  const buy = String(input.buyType ?? "").trim().toLowerCase()
  if (input.fixedCost === true || buy === "fixed_cost") return emptyEstimate()

  const days = input.days.map((day) => ({
    date: day.date,
    impressions: day.impressions,
    clicks: day.clicks,
    results: buy === "cpv" ? Number(day.video3sViews) || 0 : day.results,
  }))

  const derived = deriveSpendFromPlanRate({
    lineItemId: input.lineItemId,
    buyType: input.buyType,
    bursts: asBursts(input.bursts),
    days,
  })

  if (!(derived.plannedDeliverables > 0)) {
    return {
      amount: null,
      spendMode: null,
      reason: NO_PLANNED_IMPRESSIONS,
      plannedMedia: derived.plannedTotal,
      days: [],
      warnings: derived.warnings,
    }
  }

  const amount =
    Math.round(derived.days.reduce((sum, day) => sum + day.derivedSpend, 0) * 100) / 100

  return {
    amount,
    spendMode: "estimated",
    reason: null,
    plannedMedia: derived.plannedTotal,
    days: derived.days.map((day) => ({ date: day.date, derivedSpend: day.derivedSpend })),
    warnings: derived.warnings,
  }
}
