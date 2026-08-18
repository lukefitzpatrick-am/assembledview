import type { DateRange } from "@/lib/dashboard/dateFilter"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { buildDirectDigitalChannelSection } from "./directDigitalAdapterShared"
import type { ChannelSectionData } from "./types"

export function buildDigitalDisplaySection(input: {
  lineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  filterRange: DateRange
  kpiVersionNumber: number
  lineItemTargets: Map<string, CampaignKPI> | undefined
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  return buildDirectDigitalChannelSection({
    key: "digital-display",
    title: "Digital Display",
    ...input,
  })
}
