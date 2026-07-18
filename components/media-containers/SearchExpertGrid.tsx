"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  SEARCH_EXPERT_CHANNEL_CONFIG,
  createEmptySearchExpertRow,
  SEARCH_BUY_TYPE_OPTIONS,
  SEARCH_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { SearchExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptySearchExpertRow,
  SEARCH_BUY_TYPE_OPTIONS,
  SEARCH_BID_STRATEGY_OPTIONS,
}

export interface SearchExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feesearch: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: SearchExpertScheduleRow[]
  onRowsChange: (rows: SearchExpertScheduleRow[]) => void
  /** Platform names (search publishers API) for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function SearchExpertGrid({ feesearch, ...rest }: SearchExpertGridProps) {
  return (
    <ExpertGrid
      config={SEARCH_EXPERT_CHANNEL_CONFIG}
      feePercent={feesearch}
      {...rest}
    />
  )
}
