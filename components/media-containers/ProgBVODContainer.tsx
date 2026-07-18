"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PROGBVOD_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import {
  getChannelBursts,
  calculateChannelInvestmentPerMonth,
  type MediaCode,
} from "@/lib/mediaplan/useMediaChannelContainer"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface ProgBvodContainerProps {
  clientId: string
  feeprogbvod: number
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

export function getProgBvodBursts(
  form: any,
  feeprogbvod: number,
  mbaNumber?: string,
) {
  return getChannelBursts(
    form,
    feeprogbvod,
    mbaNumber,
    PROGBVOD_CONTAINER_CONFIG.mediaTypeIdCode as MediaCode,
    PROGBVOD_CONTAINER_CONFIG.billingMediaTypeLabel,
    "lineItems",
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feeprogbvod: number,
) {
  return calculateChannelInvestmentPerMonth(form, feeprogbvod, "lineItems")
}

export default function ProgBVODContainer({
  feeprogbvod,
  ...rest
}: ProgBvodContainerProps) {
  return (
    <MediaChannelContainer
      config={PROGBVOD_CONTAINER_CONFIG}
      feePct={feeprogbvod}
      {...rest}
    />
  )
}
