"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  PROGOOH_EXPERT_CHANNEL_CONFIG,
  createEmptyProgOohExpertRow,
  PROGOOH_BUY_TYPE_OPTIONS,
  PROGOOH_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProgOohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyProgOohExpertRow,
  PROGOOH_BUY_TYPE_OPTIONS,
  PROGOOH_BID_STRATEGY_OPTIONS,
}

export interface ProgOohExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogooh: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgOohExpertScheduleRow[]
  onRowsChange: (rows: ProgOohExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function ProgOohExpertGrid({
  feeprogooh,
  ...rest
}: ProgOohExpertGridProps) {
  return (
    <ExpertGrid
      config={PROGOOH_EXPERT_CHANNEL_CONFIG}
      feePercent={feeprogooh}
      {...rest}
    />
  )
}
