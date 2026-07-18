"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
  createEmptyDigitalDisplayExpertRow,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
  type ExpertGridSiteOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { DigitalDisplayExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyDigitalDisplayExpertRow,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
}

export interface DigitalDisplayExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feedigidisplay: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: DigitalDisplayExpertScheduleRow[]
  onRowsChange: (rows: DigitalDisplayExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Site options (platform + site) for the site combobox */
  digiDisplaySites?: ExpertGridSiteOption[]
  onReorder?: () => void
}

export function DigitalDisplayExpertGrid({
  feedigidisplay,
  digiDisplaySites = [],
  ...rest
}: DigitalDisplayExpertGridProps) {
  return (
    <ExpertGrid
      config={DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG}
      feePercent={feedigidisplay}
      sites={digiDisplaySites}
      {...rest}
    />
  )
}
