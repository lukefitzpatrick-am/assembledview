import {
  burstsForLineItem,
  type SeedLineFeesMediaConfig,
} from "@/lib/billing/seedLineFees"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { resolveProductionBurstBudget } from "@/lib/mediaplan/resolveProductionBurstBudget"

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

function feePctFromBurstOrLine(burst: any, lineItem: any): number {
  const raw =
    burst?.feePercentage ??
    burst?.fee_percentage ??
    lineItem?.feePercentage ??
    lineItem?.fee_percentage
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
}

/**
 * Fee for one burst via {@link computeBurstAmounts} (same engine as
 * computeCampaignFinancials). Falls back to persisted `feeAmount` only when
 * there is no budget to recompute from (container-authored feeAmount fixtures).
 */
function feeAmountFromBurst(burst: any, lineItem: any): number {
  const { effectiveBudget } = resolveProductionBurstBudget(burst)
  const feePct = feePctFromBurstOrLine(burst, lineItem)
  const budgetIncludesFees = Boolean(
    burst?.budgetIncludesFees ??
      burst?.budget_includes_fees ??
      lineItem?.budgetIncludesFees ??
      lineItem?.budget_includes_fees
  )
  const clientPaysForMedia = Boolean(
    burst?.clientPaysForMedia ??
      burst?.client_pays_for_media ??
      lineItem?.clientPaysForMedia ??
      lineItem?.client_pays_for_media
  )
  const buyType = String(
    burst?.buyType ?? burst?.buy_type ?? lineItem?.buyType ?? lineItem?.buy_type ?? ""
  )

  const persisted = Number(burst?.feeAmount ?? burst?.fee_amount)
  const hasPersisted = Number.isFinite(persisted)

  if (effectiveBudget === 0 && !budgetIncludesFees && hasPersisted) {
    return persisted
  }

  return computeBurstAmounts({
    rawBudget: effectiveBudget,
    budgetIncludesFees,
    clientPaysForMedia,
    feePct,
    buyType,
  }).feeAmount
}

/**
 * Sum campaign fee via the canonical burst fee engine (C-7/C-8).
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

      const feeAmount = burstSources.reduce(
        (sum, b) => sum + feeAmountFromBurst(b, sourceLine),
        0
      )
      perLineBreakdown.push({
        billingStableLineItemId: billingStableLineItemId(billingKey, sourceLine, liIndex),
        feeAmount,
      })
      totalFeeAmount += feeAmount
    })
  }

  return { totalFeeAmount, perLineBreakdown }
}
