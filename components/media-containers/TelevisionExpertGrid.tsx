"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  TELEVISION_EXPERT_CHANNEL_CONFIG,
  createEmptyTelevisionExpertRow,
  TV_BUY_TYPE_OPTIONS,
  type ExpertGridStationOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { TelevisionExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyTelevisionExpertRow,
  TV_BUY_TYPE_OPTIONS,
}

export interface TelevisionExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feetelevision: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: TelevisionExpertScheduleRow[]
  onRowsChange: (rows: TelevisionExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Station options for the station combobox */
  tvStations?: ExpertGridStationOption[]
  onReorder?: () => void
  /** Controlled week-start; parent owns state so Apply columns match grid keys. */
  weekStartsOn?: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn
  onWeekStartsOnChange?: (v: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn) => void

}

export function TelevisionExpertGrid({
  feetelevision,
  tvStations = [],
  ...rest
}: TelevisionExpertGridProps) {
  return (
    <ExpertGrid
      config={TELEVISION_EXPERT_CHANNEL_CONFIG}
      feePercent={feetelevision}
      stations={tvStations}
      {...rest}
    />
  )
}
