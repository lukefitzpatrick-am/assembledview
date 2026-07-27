"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  CINEMA_EXPERT_CHANNEL_CONFIG,
  createEmptyCinemaExpertRow,
  CINEMA_BUY_TYPE_OPTIONS,
  type ExpertGridStationOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { CinemaExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyCinemaExpertRow,
  CINEMA_BUY_TYPE_OPTIONS,
}

export interface CinemaExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feecinema: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: CinemaExpertScheduleRow[]
  onRowsChange: (rows: CinemaExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Station options for the station combobox */
  cinemaStations?: ExpertGridStationOption[]
  onReorder?: () => void
}

export function CinemaExpertGrid({
  feecinema,
  cinemaStations = [],
  ...rest
}: CinemaExpertGridProps) {
  return (
    <ExpertGrid
      config={CINEMA_EXPERT_CHANNEL_CONFIG}
      feePercent={feecinema}
      stations={cinemaStations}
      {...rest}
    />
  )
}
