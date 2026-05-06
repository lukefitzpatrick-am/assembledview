import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import type { ChannelSectionData } from "./types"
import { buildSocialChannelSectionForPlatform } from "./socialAdapterShared"

export function buildSocialMetaSection(input: {
  lineItems: SocialLineItem[]
  snowflakeRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  kpiTargets: KPITargetsMap | undefined
  filterRange: DateRange
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData {
  return buildSocialChannelSectionForPlatform({
    key: "social-meta",
    platform: "meta",
    title: "Social – Meta",
    ...input,
  })
}
