import type { BillingMonth } from "@/lib/billing/types"

export type BillingMonthEntry = BillingMonth

export interface FeeDriftValidationResult {
  withinTolerance: boolean
  sumOfMonthFeeTotals: number
  derivedCampaignFee: number
  /** Signed: positive means month sum is over derived. */
  diff: number
  toleranceUsed: number
}

const DEFAULT_TOLERANCE = 10

function parseMoney(v: unknown): number {
  return parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0
}

export function validateAgencyFeeMonthTotalDrift(
  months: BillingMonthEntry[],
  derivedCampaignFee: number,
  options?: { tolerance?: number }
): FeeDriftValidationResult {
  const toleranceUsed = options?.tolerance ?? DEFAULT_TOLERANCE
  const sumOfMonthFeeTotals = months.reduce((sum, m) => sum + parseMoney(m.feeTotal), 0)
  const diff = sumOfMonthFeeTotals - derivedCampaignFee
  const withinTolerance = Math.abs(diff) < toleranceUsed

  return {
    withinTolerance,
    sumOfMonthFeeTotals,
    derivedCampaignFee,
    diff,
    toleranceUsed,
  }
}
