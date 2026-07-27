"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
  createEmptyProgDisplayExpertRow,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProgDisplayExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyProgDisplayExpertRow,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BID_STRATEGY_OPTIONS,
}

export interface ProgDisplayExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogdisplay: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgDisplayExpertScheduleRow[]
  onRowsChange: (rows: ProgDisplayExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function ProgDisplayExpertGrid({
  feeprogdisplay,
  ...rest
}: ProgDisplayExpertGridProps) {
  return (
    <ExpertGrid
      config={PROGDISPLAY_EXPERT_CHANNEL_CONFIG}
      feePercent={feeprogdisplay}
      {...rest}
    />
  )
}
