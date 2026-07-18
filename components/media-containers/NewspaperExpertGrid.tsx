"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  NEWSPAPER_EXPERT_CHANNEL_CONFIG,
  createEmptyNewspaperExpertRow,
  NEWSPAPER_BUY_TYPE_OPTIONS,
  type ExpertGridTitleOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { NewspaperExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyNewspaperExpertRow,
  NEWSPAPER_BUY_TYPE_OPTIONS,
}

export interface NewspaperExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feenewspapers: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: NewspaperExpertScheduleRow[]
  onRowsChange: (rows: NewspaperExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Title options (network-filtered) for the title combobox */
  newspapers?: ExpertGridTitleOption[]
  onReorder?: () => void
}

export function NewspaperExpertGrid({
  feenewspapers,
  newspapers = [],
  ...rest
}: NewspaperExpertGridProps) {
  return (
    <ExpertGrid
      config={NEWSPAPER_EXPERT_CHANNEL_CONFIG}
      feePercent={feenewspapers}
      titles={newspapers}
      {...rest}
    />
  )
}
