"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PROGDISPLAY_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import {
  getChannelBursts,
  calculateChannelInvestmentPerMonth,
  type MediaCode,
} from "@/lib/mediaplan/useMediaChannelContainer"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface ProgDisplayContainerProps {
  clientId: string
  feeprogdisplay: number
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

export function getProgDisplayBursts(
  form: any,
  feeprogdisplay: number,
  mbanumber?: string,
) {
  return getChannelBursts(
    form,
    feeprogdisplay,
    mbanumber,
    PROGDISPLAY_CONTAINER_CONFIG.mediaTypeIdCode as MediaCode,
    PROGDISPLAY_CONTAINER_CONFIG.billingMediaTypeLabel,
    "lineItems",
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feeprogdisplay: number,
) {
  return calculateChannelInvestmentPerMonth(form, feeprogdisplay, "lineItems")
}

export default function ProgDisplayContainer({
  feeprogdisplay,
  ...rest
}: ProgDisplayContainerProps) {
  return (
    <MediaChannelContainer
      config={PROGDISPLAY_CONTAINER_CONFIG}
      feePct={feeprogdisplay}
      {...rest}
    />
  )
}
