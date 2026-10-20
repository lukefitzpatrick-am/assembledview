import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { ChannelSectionData } from "./types"
import type { ChannelPacingInputs } from "./linePace"
import { buildSocialChannelSectionForPlatform } from "./socialAdapterShared"

export function buildSocialTiktokSection(input: {
  lineItems: SocialLineItem[]
  snowflakeRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  kpiVersionNumber: number
  kpiTargets: KPITargetsMap | undefined
  lineItemTargets: Map<string, CampaignKPI> | undefined
  filterRange: DateRange
  brandColour?: string
  lastSyncedAt: Date | null
  isAdmin?: boolean
} & ChannelPacingInputs): ChannelSectionData {
  return buildSocialChannelSectionForPlatform({
    key: "social-tiktok",
    platform: "tiktok",
    title: "Social – TikTok",
    ...input,
  })
}
