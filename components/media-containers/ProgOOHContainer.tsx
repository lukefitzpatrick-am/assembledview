"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PROGOOH_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import {
  getChannelBursts,
  calculateChannelInvestmentPerMonth,
  type MediaCode,
} from "@/lib/mediaplan/useMediaChannelContainer"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface ProgOOHContainerProps {
  clientId: string
  feeprogooh: number
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

export function getProgOohBursts(
  form: any,
  feeprogooh: number,
  mbaNumber?: string,
) {
  return getChannelBursts(
    form,
    feeprogooh,
    mbaNumber,
    PROGOOH_CONTAINER_CONFIG.mediaTypeIdCode as MediaCode,
    PROGOOH_CONTAINER_CONFIG.billingMediaTypeLabel,
    "lineItems",
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feeprogooh: number,
) {
  return calculateChannelInvestmentPerMonth(form, feeprogooh, "lineItems")
}

export default function ProgOOHContainer({
  feeprogooh,
  ...rest
}: ProgOOHContainerProps) {
  return (
    <MediaChannelContainer
      config={PROGOOH_CONTAINER_CONFIG}
      feePct={feeprogooh}
      {...rest}
    />
  )
}
