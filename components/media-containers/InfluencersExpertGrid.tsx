"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  INFLUENCERS_EXPERT_CHANNEL_CONFIG,
  createEmptyInfluencersExpertRow,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INFLUENCERS_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { InfluencersExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyInfluencersExpertRow,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INFLUENCERS_BID_STRATEGY_OPTIONS,
}

export interface InfluencersExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeinfluencers: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: InfluencersExpertScheduleRow[]
  onRowsChange: (rows: InfluencersExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function InfluencersExpertGrid({
  feeinfluencers,
  ...rest
}: InfluencersExpertGridProps) {
  return (
    <ExpertGrid
      config={INFLUENCERS_EXPERT_CHANNEL_CONFIG}
      feePercent={feeinfluencers}
      {...rest}
    />
  )
}
