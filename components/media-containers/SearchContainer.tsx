"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { SEARCH_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import { calculateChannelInvestmentPerMonth } from "@/lib/mediaplan/useMediaChannelContainer"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface SearchContainerProps {
  clientId: string
  feesearch: number
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  onMediaLineItemsChange: (lineItems: any[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: string[]
  initialLineItems?: any[]
}

/**
 * Search billing bursts ΓÇö escape hatch vs shared getChannelBursts:
 * hardcodes deliverables: 0, noAdserving: false, and omits lineItemId
 * (edit page + billing consumers depend on this shape).
 */
export function getSearchBursts(
  form: any,
  feesearch: number,
): BillingBurst[] {
  const lineItems = form.getValues("lineItems") || []

  return lineItems.flatMap((li: any) =>
    (li.bursts || []).map((burst: any) => {
      const rawBudget = parseFloat(String(burst.budget ?? "").replace(/[^0-9.]/g, "")) || 0
      const pct = feesearch || 0

      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget,
        budgetIncludesFees: !!li.budgetIncludesFees,
        clientPaysForMedia: !!li.clientPaysForMedia,
        feePct: pct,
      })

      return {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: "search",
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: false,
        deliverables: 0,
        buyType: li.buyType,
      }
    }),
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feesearch: number,
) {
  return calculateChannelInvestmentPerMonth(form, feesearch, "lineItems")
}

export default function SearchContainer({
  feesearch,
  ...rest
}: SearchContainerProps) {
  return (
    <MediaChannelContainer
      config={SEARCH_CONTAINER_CONFIG}
      feePct={feesearch}
      {...rest}
    />
  )
}
