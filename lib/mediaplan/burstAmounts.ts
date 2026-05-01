/**
 * Channel-agnostic burst-level money math for media plan line items.
 *
 * Single source of truth replacing inline 3-branch math previously duplicated
 * across:
 *   - 19 Container `get<Channel>Bursts(form, feePct)` functions
 *     (DigitalDisplay, Television, Newspaper, Cinema verified byte-identical
 *     in Stage 0d; remaining 15 follow the same pattern.)
 *   - `expertRowFeeSplit(rawCost, budgetIncludesFees, feePct)` in
 *     `lib/mediaplan/expertChannelMappings.ts`, which previously implemented
 *     only 2 of the 3 effective branches.
 *
 * The `clientPaysForMedia` branch was missing from `expertRowFeeSplit`,
 * causing Expert mode to charge clients for media that should be marked as
 * publisher-direct. Routing every Container and Expert caller through this
 * primitive closes that gap by construction (Stage 2 / bug cluster 1).
 */

export interface ComputeBurstAmountsInput {
  /** Raw budget value entered by the user, before fee adjustments. */
  rawBudget: number
  /** When true, the entered budget is gross (includes fees). Net media is computed. */
  budgetIncludesFees: boolean
  /** When true, the publisher invoices the client directly. Agency receives fee only. */
  clientPaysForMedia: boolean
  /** Fee percentage as a number (e.g. 12 for 12%). Pass 0 for fee-free channels. */
  feePct: number
}

export interface ComputeBurstAmountsOutput {
  /** Amount the agency invoices the client for media (excluding fees). 0 when clientPaysForMedia. */
  mediaAmount: number
  /** Amount used for delivery/spend tracking. Equals net media regardless of who invoices. */
  deliveryMediaAmount: number
  /** Fee amount the agency invoices. */
  feeAmount: number
  /** Total amount the agency invoices the client (mediaAmount + feeAmount). */
  totalAmount: number
}

/**
 * Computes media + fee amounts for a single burst. Channel-agnostic.
 *
 * Three branches, in priority order:
 *
 *   1. `budgetIncludesFees` — entered budget is gross. Split into net media +
 *      fee at the channel fee rate. When `clientPaysForMedia` is also true,
 *      `mediaAmount` is zeroed (publisher invoices direct) but
 *      `deliveryMediaAmount` retains the net media value for delivery
 *      tracking. Matches the nested `clientPaysForMedia` check inside the
 *      `budgetIncludesFees` block of the Container `get<Channel>Bursts`
 *      functions verified in Stage 0d.
 *
 *   2. `clientPaysForMedia` (and not `budgetIncludesFees`) — entered budget
 *      is net media. Fee is grossed-up so the agency invoice covers the same
 *      fee the client would see if media were billed normally. Media is not
 *      invoiced (publisher direct), but `deliveryMediaAmount` still records
 *      the budget for delivery tracking.
 *
 *   3. Standard (neither flag set) — entered budget is net media. Fee is
 *      stacked on top using the gross-up formula `(budget * pct) / (100 - pct)`.
 *
 * Fee-free channels pass `feePct = 0`. All branches handle that correctly:
 * branch 1 yields `feeAmount = 0`, `mediaAmount = budget`; branches 2 and 3
 * yield `feeAmount = 0` and `totalAmount = budget` (or `0` for branch 2's
 * `mediaAmount`).
 *
 * Defensive: non-finite `rawBudget` or `feePct` are treated as 0. A `feePct`
 * of exactly 100 short-circuits to `feeAmount = 0` in branches 2 and 3 to
 * avoid division by zero (matches the existing `expertRowFeeSplit` guard).
 */
export function computeBurstAmounts({
  rawBudget,
  budgetIncludesFees,
  clientPaysForMedia,
  feePct,
}: ComputeBurstAmountsInput): ComputeBurstAmountsOutput {
  const budget = Number.isFinite(rawBudget) ? rawBudget : 0
  const pct = Number.isFinite(feePct) ? feePct : 0

  if (budgetIncludesFees) {
    const feeAmount = budget * (pct / 100)
    const netMedia = budget * ((100 - pct) / 100)
    const mediaAmount = clientPaysForMedia ? 0 : netMedia
    return {
      mediaAmount,
      deliveryMediaAmount: netMedia,
      feeAmount,
      totalAmount: mediaAmount + feeAmount,
    }
  }

  if (clientPaysForMedia) {
    const feeAmount = pct === 100 ? 0 : (budget / (100 - pct)) * pct
    return {
      mediaAmount: 0,
      deliveryMediaAmount: budget,
      feeAmount,
      totalAmount: feeAmount,
    }
  }

  const feeAmount = pct === 100 ? 0 : (budget * pct) / (100 - pct)
  return {
    mediaAmount: budget,
    deliveryMediaAmount: budget,
    feeAmount,
    totalAmount: budget + feeAmount,
  }
}
