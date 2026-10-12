/**
 * Estimated delivered spend for CM360 direct digital
 * (digital display, digital video, digital audio, BVOD).
 *
 * Wraps `deriveSpendFromPlanRate`. Rate is planned media ÷ planned
 * deliverables, capped at planned media. A fee-inclusive budget with no
 * media amount is converted to net first, and the cap is that net media.
 * Never uses buyAmount.
 * CPV prices `video3sViews` (the column TL0 named), not platform `results`.
 * Programmatic callers of `deriveSpendFromPlanRate` are unchanged.
 * Fixed-cost lines are not estimated; reported spend replaces this figure.
 */

import {
  deriveSpendFromPlanRate,
  type DeriveSpendBurstInput,
  type DeriveSpendDayInput,
} from "@/lib/delivery/deriveSpendFromPlanRate"
import { netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { roundMoney2 } from "@/lib/money"

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
  /**
   * When true, a burst with no media amount holds a gross budget.
   * `feePct` is the channel percent from the version fee snapshot.
   * Null means no snapshot and no client fee loading already in hand.
   */
  budgetIncludesFees?: boolean
  feePct?: number | null
  versionId?: number | null
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

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ""
}

function parseCurrency(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "")
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function hasMediaAmount(burst: DeriveSpendBurstInput): boolean {
  return isPresent(burst.media_amount ?? burst.mediaAmount)
}

/**
 * Fee-inclusive budgets with no media amount are gross. Rewrite the fields
 * `deriveSpendFromPlanRate` reads (`budget_number`, then `budget`) to net
 * so the cap is planned net media. Bursts that already have a media amount
 * stay as stored. The derive helper itself is not changed.
 */
function burstsForEstimate(input: EstimateDirectDigitalSpendInput): DeriveSpendBurstInput[] {
  const bursts = asBursts(input.bursts)
  if (input.budgetIncludesFees !== true) return bursts
  const feePct = input.feePct
  if (feePct == null || !Number.isFinite(feePct)) {
    const id = input.versionId == null ? "unknown" : String(input.versionId)
    console.warn(`[direct-digital-estimate] no fee snapshot for version ${id}; using gross`)
    return bursts
  }
  return bursts.map((burst) => {
    if (hasMediaAmount(burst)) return burst
    const gross = burst.budget_number ?? burst.budget ?? burst.media_investment
    if (!isPresent(gross)) return burst
    const net = netFromGross(parseCurrency(gross), true, feePct)
    return { ...burst, budget: net, budget_number: net }
  })
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
    bursts: burstsForEstimate(input),
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

  const amount = roundMoney2(derived.days.reduce((sum, day) => sum + day.derivedSpend, 0))

  return {
    amount,
    spendMode: "estimated",
    reason: null,
    plannedMedia: derived.plannedTotal,
    days: derived.days.map((day) => ({ date: day.date, derivedSpend: day.derivedSpend })),
    warnings: derived.warnings,
  }
}
