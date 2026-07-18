"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  RADIO_EXPERT_CHANNEL_CONFIG,
  createEmptyRadioExpertRow,
  RADIO_BUY_TYPE_OPTIONS,
  type ExpertGridStationOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { RadioExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyRadioExpertRow,
  RADIO_BUY_TYPE_OPTIONS,
}

export interface RadioExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeradio: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: RadioExpertScheduleRow[]
  onRowsChange: (rows: RadioExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Station options for the station combobox */
  radioStations?: ExpertGridStationOption[]
  onReorder?: () => void
}

export function RadioExpertGrid({
  feeradio,
  radioStations = [],
  ...rest
}: RadioExpertGridProps) {
  return (
    <ExpertGrid
      config={RADIO_EXPERT_CHANNEL_CONFIG}
      feePercent={feeradio}
      stations={radioStations}
      {...rest}
    />
  )
}
