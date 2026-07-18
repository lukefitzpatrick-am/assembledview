"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
  createEmptySocialMediaExpertRow,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { SocialMediaExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptySocialMediaExpertRow,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BID_STRATEGY_OPTIONS,
}

export interface SocialMediaExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feesocial: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: SocialMediaExpertScheduleRow[]
  onRowsChange: (rows: SocialMediaExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function SocialMediaExpertGrid({
  feesocial,
  ...rest
}: SocialMediaExpertGridProps) {
  return (
    <ExpertGrid
      config={SOCIALMEDIA_EXPERT_CHANNEL_CONFIG}
      feePercent={feesocial}
      {...rest}
    />
  )
}
