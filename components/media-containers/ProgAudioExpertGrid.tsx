"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  PROGAUDIO_EXPERT_CHANNEL_CONFIG,
  createEmptyProgAudioExpertRow,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGAUDIO_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProgAudioExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyProgAudioExpertRow,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGAUDIO_BID_STRATEGY_OPTIONS,
}

export interface ProgAudioExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogaudio: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgAudioExpertScheduleRow[]
  onRowsChange: (rows: ProgAudioExpertScheduleRow[]) => void
  /** Platform names for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
  /** Controlled week-start; parent owns state so Apply columns match grid keys. */
  weekStartsOn?: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn
  onWeekStartsOnChange?: (v: import("@/lib/utils/weeklyGanttColumns").WeekStartsOn) => void

}

export function ProgAudioExpertGrid({
  feeprogaudio,
  ...rest
}: ProgAudioExpertGridProps) {
  return (
    <ExpertGrid
      config={PROGAUDIO_EXPERT_CHANNEL_CONFIG}
      feePercent={feeprogaudio}
      {...rest}
    />
  )
}
