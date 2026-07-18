"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PROGAUDIO_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import {
  getChannelBursts,
  calculateChannelInvestmentPerMonth,
  type MediaCode,
} from "@/lib/mediaplan/useMediaChannelContainer"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

interface ProgAudioContainerProps {
  clientId: string
  feeprogaudio: number
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

export function getProgAudioBursts(
  form: any,
  feeprogaudio: number,
  mbaNumber?: string,
) {
  return getChannelBursts(
    form,
    feeprogaudio,
    mbaNumber,
    PROGAUDIO_CONTAINER_CONFIG.mediaTypeIdCode as MediaCode,
    PROGAUDIO_CONTAINER_CONFIG.billingMediaTypeLabel,
    "lineItems",
  )
}

export function calculateInvestmentPerMonth(
  form: any,
  feeprogaudio: number,
) {
  return calculateChannelInvestmentPerMonth(form, feeprogaudio, "lineItems")
}

export default function ProgAudioContainer({
  feeprogaudio,
  ...rest
}: ProgAudioContainerProps) {
  return (
    <MediaChannelContainer
      config={PROGAUDIO_CONTAINER_CONFIG}
      feePct={feeprogaudio}
      {...rest}
    />
  )
}
