/**
 * Always-on, never-blocking tripwire for missing / partial ad-serving on save.
 * Logs `[savePlan-adserving-zero]` — does not throw.
 */

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
