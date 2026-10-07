import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import type { BillingMonth } from "@/lib/billing/types"

/**
 * Fee totals for the create-page manual billing snapshot.
 * Same engine as the edit page (generateBillingLineItems), with fees emitted
 * so bonus and package inclusions contribute 0.
 */
export function billingSnapshotFeeTotals(
  lineItems: any[],
  mediaKey: string,
  months: BillingMonth[] | { monthYear: string }[],
): number[] {
  return generateBillingLineItems(lineItems, mediaKey, months, "billing").map(
    (line) => line.totalFeeAmount ?? 0,
  )
}
