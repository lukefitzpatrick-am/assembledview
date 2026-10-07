import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"

/**
 * Fee for a saved billing month when the row has no feeTotal.
 * The line amounts are net media. Fee is a slice of gross, the same number
 * computeBurstAmounts returns for one net-in burst.
 * Search and social only: the saved payload only carries those two fee rates.
 */
export function legacyMonthFeeFromNetMedia(mediaTotal: number, feePercentage: number): number {
  if (!(mediaTotal > 0) || !(feePercentage > 0)) return 0
  return computeBurstAmounts({
    rawBudget: mediaTotal,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: feePercentage,
  }).feeAmount
}
