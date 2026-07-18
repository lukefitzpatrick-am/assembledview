"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  BVOD_EXPERT_CHANNEL_CONFIG,
  createEmptyBvodExpertRow,
  BVOD_BUY_TYPE_OPTIONS,
  type ExpertGridSiteOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { BvodExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyBvodExpertRow,
  BVOD_BUY_TYPE_OPTIONS,
}

export interface BVODExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feebvod: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: BvodExpertScheduleRow[]
  onRowsChange: (rows: BvodExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Site options (platform + site) for the site combobox */
  bvodSites?: ExpertGridSiteOption[]
  onReorder?: () => void
}

export function BVODExpertGrid({
  feebvod,
  bvodSites = [],
  ...rest
}: BVODExpertGridProps) {
  return (
    <ExpertGrid
      config={BVOD_EXPERT_CHANNEL_CONFIG}
      feePercent={feebvod}
      sites={bvodSites}
      {...rest}
    />
  )
}
