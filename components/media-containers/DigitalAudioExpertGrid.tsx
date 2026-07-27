"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
  createEmptyDigitalAudioExpertRow,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
  type ExpertGridSiteOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { DigitalAudioExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyDigitalAudioExpertRow,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
}

export interface DigitalAudioExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feedigiaudio: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: DigitalAudioExpertScheduleRow[]
  onRowsChange: (rows: DigitalAudioExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Site options (platform + site) for the site combobox */
  digiAudioSites?: ExpertGridSiteOption[]
  onReorder?: () => void
}

export function DigitalAudioExpertGrid({
  feedigiaudio,
  digiAudioSites = [],
  ...rest
}: DigitalAudioExpertGridProps) {
  return (
    <ExpertGrid
      config={DIGIAUDIO_EXPERT_CHANNEL_CONFIG}
      feePercent={feedigiaudio}
      sites={digiAudioSites}
      {...rest}
    />
  )
}
