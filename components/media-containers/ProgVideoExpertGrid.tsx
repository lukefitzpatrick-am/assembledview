"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  PROGVIDEO_EXPERT_CHANNEL_CONFIG,
  createEmptyProgVideoExpertRow,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  PROGVIDEO_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProgVideoExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyProgVideoExpertRow,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  PROGVIDEO_BID_STRATEGY_OPTIONS,
}

export interface ProgVideoExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogvideo: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgVideoExpertScheduleRow[]
  onRowsChange: (rows: ProgVideoExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function ProgVideoExpertGrid({
  feeprogvideo,
  ...rest
}: ProgVideoExpertGridProps) {
  return (
    <ExpertGrid
      config={PROGVIDEO_EXPERT_CHANNEL_CONFIG}
      feePercent={feeprogvideo}
      {...rest}
    />
  )
}
