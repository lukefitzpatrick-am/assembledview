"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PROGVIDEO_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import {
  getChannelBursts,
  calculateChannelInvestmentPerMonth,
  type MediaCode,
} from "@/lib/mediaplan/useMediaChannelContainer"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface ProgVideoContainerProps {
  clientId: string
  feeprogvideo: number
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

export function getProgVideoBursts(
  form: any,
  feeprogvideo: number,
  mbaNumber?: string,
) {
  return getChannelBursts(
    form,
    feeprogvideo,
    mbaNumber,
    PROGVIDEO_CONTAINER_CONFIG.mediaTypeIdCode as MediaCode,
    PROGVIDEO_CONTAINER_CONFIG.billingMediaTypeLabel,
    "lineItems",
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feeprogvideo: number,
) {
  return calculateChannelInvestmentPerMonth(form, feeprogvideo, "lineItems")
}

export default function ProgVideoContainer({
  feeprogvideo,
  ...rest
}: ProgVideoContainerProps) {
  return (
    <MediaChannelContainer
      config={PROGVIDEO_CONTAINER_CONFIG}
      feePct={feeprogvideo}
      {...rest}
    />
  )
}
