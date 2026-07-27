/**
 * Save-time guard: billing schedule feeTotal must match the sum of feeAmount
 * that will be (or was) persisted on line-item bursts_json.
 *
 * In-memory campaignFinancials alone is not enough — bare containers can leave
 * feePct unset on published line items while FeeLoading still bills a fee.
 */

import type { BillingMonth } from "@/lib/billing/types"
import {
  extractAndFormatBursts,
  parseBurstMoney,
} from "@/lib/mediaplan/formatBurstsForPersist"

const FEE_MATCH_EPS = 0.02

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseAudMoney(val: unknown): number {
  return parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0
}

/** Sum feeAmount across bursts as extractAndFormatBursts would persist them. */
export function sumPersistedLineItemFeeAmounts(
  lineItems: ReadonlyArray<Record<string, unknown> | null | undefined>
): number {
  let sum = 0
  for (const raw of lineItems) {
    if (!raw) continue
    const feePct =
      raw.feePct ?? raw.feePercentage ?? raw.fee_percentage
    const bursts = extractAndFormatBursts(raw, feePct as number | undefined)
    for (const burst of bursts) {
      sum += parseBurstMoney(burst.feeAmount)
    }
  }
  return round2(sum)
}

export function sumBillingScheduleFeeTotal(months: ReadonlyArray<BillingMonth>): number {
  return round2(months.reduce((s, m) => s + parseAudMoney(m.feeTotal), 0))
}

/**
 * Blocking issues when schedule feeTotal diverges from summed persisted line fees.
 * Empty when within EPS. Does not replace collectBillingMonthStructuralBlockingIssues.
 */
export function collectPersistedFeeBillingMismatchIssues(args: {
  months: ReadonlyArray<BillingMonth>
  /** All enabled-channel media line items about to be saved (pre-persist shape). */
  lineItems: ReadonlyArray<Record<string, unknown> | null | undefined>
  fmt?: Intl.NumberFormat
}): string[] {
  const {
    months,
    lineItems,
    fmt = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  } = args

  if (months.length === 0) return []

  const billingFee = sumBillingScheduleFeeTotal(months)
  const persistedFee = sumPersistedLineItemFeeAmounts(lineItems)
  if (Math.abs(billingFee - persistedFee) <= FEE_MATCH_EPS) return []

  return [
    `Billing fee total (${fmt.format(billingFee)}) does not match the sum of persisted line-item fee amounts (${fmt.format(persistedFee)}).`,
  ]
}
