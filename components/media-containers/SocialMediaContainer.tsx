"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { SOCIALMEDIA_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { BillingBurst } from "@/lib/billing/types"
import type { LineItem } from "@/lib/generateMediaPlan"

export { getSocialMediaBursts } from "@/lib/mediaplan/socialMediaBursts"

interface SocialMediaContainerProps {
  clientId: string
  feesocial: number
  onTotalMediaChange: (totalMedia: number, totalFee: number) => void
  onBurstsChange: (bursts: BillingBurst[]) => void
  onInvestmentChange: (investmentByMonth: any) => void
  onLineItemsChange: (items: LineItem[]) => void
  /** Raw form lines; the create page counts them. */
  onSocialMediaLineItemsChange: (lineItems: any[]) => void
  onMediaLineItemsChange: (lineItems: any[]) => void
  campaignStartDate: Date
  campaignEndDate: Date
  campaignBudget: number
  campaignId: string
  mediaTypes: string[]
  initialLineItems?: any[]
}

export default function SocialMediaContainer({
  feesocial,
  onSocialMediaLineItemsChange,
  ...rest
}: SocialMediaContainerProps) {
  return (
    <MediaChannelContainer
      config={SOCIALMEDIA_CONTAINER_CONFIG}
      feePct={feesocial}
      onRawLineItemsChange={onSocialMediaLineItemsChange}
      {...rest}
    />
  )
}
