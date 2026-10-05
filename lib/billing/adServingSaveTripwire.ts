/**
 * Always-on, never-blocking tripwire for missing / partial ad-serving on save.
 * Logs `[savePlan-adserving-zero]` — does not throw.
 */

import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { isAdServingEligibleMediaType } from "@/lib/billing/adServingRateResolver"
import type { BillingMonth } from "@/lib/billing/types"

const NEAR_ZERO = 0.005

export type AdServingTripwireLine = {
  lineItemId: string
  mediaType: string
  deliverables: number
  adServingAmount: number
}

export type AdServingZeroTripwireResult = {
  kind: "campaign_zero" | "partial_zero"
  adServingTotal: number
  /** Eligible lines that should have charged but got ~$0. */
  zeroLines: AdServingTripwireLine[]
  /** Eligible lines that did charge (partial_zero only). */
  chargedLines: AdServingTripwireLine[]
}

export type AdServingTripwirePerLine = {
  lineItemId: string
  mediaType: string
  deliverables: number
  flags: { excluded: boolean }
  /** Present when the save path knows the line buy type. */
  buyType?: string
  /**
   * Positive ad-serving impressions on the line (max across bursts).
   * Absent or not > 0 means the line has none.
   */
  adServingImpressions?: number
  /**
   * Unrounded sum of `computeAdServingCost` across bursts.
   * A positive value that rounds below one cent is zero on the schedule by design.
   */
  computedAdServing?: number
}

export type AdServingTripwireComputeSource = {
  lineItemId: string
  mediaType: string
  buyType: string
  bursts: Array<{
    deliverables?: number
    calculatedValue?: number
    adServingRatePct?: number
    adServingImpressions?: number
  }>
}

function normaliseBuyType(buyType: string | undefined): string {
  return (buyType ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

/** fixed_cost with no impressions, or a positive compute that currency-rounds to $0.00. */
function isZeroAdServingByDesign(pl: AdServingTripwirePerLine): boolean {
  if (normaliseBuyType(pl.buyType) === "fixed_cost") {
    if (!(typeof pl.adServingImpressions === "number" && pl.adServingImpressions > 0)) {
      return true
    }
  }
  const computed = pl.computedAdServing
  if (
    typeof computed === "number" &&
    Number.isFinite(computed) &&
    computed > 0 &&
    Math.round(computed * 100) < 1
  ) {
    return true
  }
  return false
}

/**
 * Stamp buy type, impressions, and unrounded ad-serving cost onto tripwire rows
 * so the evaluator can ignore zeros the formula produces on purpose.
 */
export function withAdServingTripwireCompute(
  perLine: AdServingTripwirePerLine[],
  sources: AdServingTripwireComputeSource[],
  getRateForMediaType: ((mediaType: string) => number) | undefined,
  adservaudio?: number | null,
): AdServingTripwirePerLine[] {
  const byId = new Map(sources.map((line) => [String(line.lineItemId), line]))
  return perLine.map((pl) => {
    const line = byId.get(String(pl.lineItemId))
    if (!line) return pl
    let impressions = 0
    let computed = 0
    const rate = getRateForMediaType?.(line.mediaType) ?? 0
    for (const burst of line.bursts) {
      if (
        typeof burst.adServingImpressions === "number" &&
        burst.adServingImpressions > impressions
      ) {
        impressions = burst.adServingImpressions
      }
      const quantity = Number(burst.deliverables ?? burst.calculatedValue ?? 0)
      computed += computeAdServingCost({
        quantity: Number.isFinite(quantity) ? quantity : 0,
        buyType: line.buyType,
        mediaType: line.mediaType,
        rate,
        adservaudio,
        adServingRatePct: burst.adServingRatePct,
        adServingImpressions: burst.adServingImpressions,
      })
    }
    return {
      ...pl,
      buyType: line.buyType,
      adServingImpressions: impressions,
      computedAdServing: computed,
    }
  })
}

/**
 * Per-line ad-serving totals from an attached schedule (first sighting of each
 * line id — `totalAdServingAmount` is the line total, repeated on each month).
 */
export function lineAdServingTotalsFromSchedule(
  schedule: BillingMonth[]
): Map<string, number> {
  const out = new Map<string, number>()
  for (const month of schedule) {
    const groups = month.lineItems
    if (!groups) continue
    for (const items of Object.values(groups)) {
      if (!Array.isArray(items)) continue
      for (const li of items) {
        const id = String(li.id ?? "")
        if (!id || out.has(id)) continue
        const amt = Number(li.totalAdServingAmount ?? 0)
        out.set(id, Number.isFinite(amt) ? amt : 0)
      }
    }
  }
  return out
}

/**
 * Decide whether to fire the ad-serving tripwire.
 * - campaign_zero: campaign total ~0 but ≥1 eligible chargeable line
 * - partial_zero: campaign total > 0 but some eligible chargeable lines are ~0
 */
export function evaluateAdServingZeroTripwire(args: {
  adServingTotal: number
  perLine: AdServingTripwirePerLine[]
  noAdservingByLineId: Map<string, boolean>
  lineAdServingById: Map<string, number>
}): AdServingZeroTripwireResult | null {
  const { adServingTotal, perLine, noAdservingByLineId, lineAdServingById } =
    args
  if (!Number.isFinite(adServingTotal)) return null

  const chargeable: AdServingTripwireLine[] = []
  for (const pl of perLine) {
    if (pl.flags.excluded) continue
    if (!isAdServingEligibleMediaType(pl.mediaType)) continue
    if (noAdservingByLineId.get(String(pl.lineItemId))) continue
    if (!(pl.deliverables > 0)) continue
    if (isZeroAdServingByDesign(pl)) continue
    const adServingAmount = lineAdServingById.get(String(pl.lineItemId)) ?? 0
    chargeable.push({
      lineItemId: String(pl.lineItemId),
      mediaType: pl.mediaType,
      deliverables: pl.deliverables,
      adServingAmount: Number.isFinite(adServingAmount) ? adServingAmount : 0,
    })
  }
  if (chargeable.length === 0) return null

  const zeroLines = chargeable.filter((l) => Math.abs(l.adServingAmount) < NEAR_ZERO)
  const chargedLines = chargeable.filter((l) => Math.abs(l.adServingAmount) >= NEAR_ZERO)

  if (Math.abs(adServingTotal) < NEAR_ZERO) {
    if (zeroLines.length === 0) return null
    return {
      kind: "campaign_zero",
      adServingTotal,
      zeroLines,
      chargedLines: [],
    }
  }

  if (zeroLines.length > 0 && chargedLines.length > 0) {
    return {
      kind: "partial_zero",
      adServingTotal,
      zeroLines,
      chargedLines,
    }
  }

  return null
}

export function logAdServingZeroTripwire(
  result: AdServingZeroTripwireResult,
  meta: {
    mba: string
    version: number
    mode: string
    hasResolver: boolean
    adservaudio: number | null
  }
): void {
  console.error("[savePlan-adserving-zero]", {
    ...meta,
    kind: result.kind,
    adServingTotal: result.adServingTotal,
    zeroLines: result.zeroLines.slice(0, 12),
    chargedLines: result.chargedLines.slice(0, 12),
  })
}
