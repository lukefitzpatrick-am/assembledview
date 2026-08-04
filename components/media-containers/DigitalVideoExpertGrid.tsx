"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
  createEmptyDigiVideoExpertRow,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
  type ExpertGridSiteOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { DigiVideoExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyDigiVideoExpertRow,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
}

export interface DigitalVideoExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feedigivideo: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: DigiVideoExpertScheduleRow[]
  onRowsChange: (rows: DigiVideoExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Site options (platform + site) for the site combobox */
  digiVideoSites?: ExpertGridSiteOption[]
  onReorder?: () => void
  /** Controlled week-start; parent owns state so Apply columns match grid keys. */
  weekStartsOn?: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn
  onWeekStartsOnChange?: (v: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn) => void

}

export function DigitalVideoExpertGrid({
  feedigivideo,
  digiVideoSites = [],
  ...rest
}: DigitalVideoExpertGridProps) {
  return (
    <ExpertGrid
      config={DIGIVIDEO_EXPERT_CHANNEL_CONFIG}
      feePercent={feedigivideo}
      sites={digiVideoSites}
      {...rest}
    />
  )
}
