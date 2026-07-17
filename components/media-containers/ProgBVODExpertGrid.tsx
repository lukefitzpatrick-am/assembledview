"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  PROGBVOD_EXPERT_CHANNEL_CONFIG,
  createEmptyProgBvodExpertRow,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGBVOD_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProgBvodExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyProgBvodExpertRow,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGBVOD_BID_STRATEGY_OPTIONS,
}

export interface ProgBvodExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogbvod: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgBvodExpertScheduleRow[]
  onRowsChange: (rows: ProgBvodExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function ProgBvodExpertGrid({
  feeprogbvod,
  ...rest
}: ProgBvodExpertGridProps) {
  return (
    <ExpertGrid
      config={PROGBVOD_EXPERT_CHANNEL_CONFIG}
      feePercent={feeprogbvod}
      {...rest}
    />
  )
}
