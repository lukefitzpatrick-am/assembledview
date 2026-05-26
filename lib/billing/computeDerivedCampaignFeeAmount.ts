import {
  burstsForLineItem,
  type SeedLineFeesMediaConfig,
} from "@/lib/billing/seedLineFees"

export interface DerivedCampaignFeeResult {
  totalFeeAmount: number
  perLineBreakdown: Array<{
    billingStableLineItemId: string
    feeAmount: number
  }>
}

function billingStableLineItemId(mediaType: string, lineItem: any, index: number): string {
  const raw = lineItem?.line_item_id ?? lineItem?.id
  if (raw != null && String(raw).trim() !== "") {
    return `billing-${mediaType}::${String(raw)}`
  }
  return `billing-${mediaType}::new-${index}`
}

/**
 * Sum `burst.feeAmount` across all line items in enabled media configs.
 * Includes client-pays lines (agency fee is independent of media payer).
 */
export function computeDerivedCampaignFeeAmount(
  configs: SeedLineFeesMediaConfig[]
): DerivedCampaignFeeResult {
  const perLineBreakdown: DerivedCampaignFeeResult["perLineBreakdown"] = []
  let totalFeeAmount = 0

  for (const { billingKey, lineItems, containerBursts } of configs) {
    if (!lineItems?.length) continue

    lineItems.forEach((sourceLine, liIndex) => {
      const burstSources = burstsForLineItem(sourceLine, liIndex, lineItems, containerBursts)
      if (burstSources.length === 0) return

      const feeAmount = burstSources.reduce((sum, b) => sum + b.feeAmount, 0)
      perLineBreakdown.push({
        billingStableLineItemId: billingStableLineItemId(billingKey, sourceLine, liIndex),
        feeAmount,
      })
      totalFeeAmount += feeAmount
    })
  }

  return { totalFeeAmount, perLineBreakdown }
}
