"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  OOH_EXPERT_CHANNEL_CONFIG,
  createEmptyOohExpertRow,
  OOH_BUY_TYPE_OPTIONS,
  OOH_FORMAT_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { OohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyOohExpertRow,
  OOH_BUY_TYPE_OPTIONS,
  OOH_FORMAT_OPTIONS,
}

export interface OohExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeooh: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: OohExpertScheduleRow[]
  onRowsChange: (rows: OohExpertScheduleRow[]) => void
  /** Publisher names for network fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Fired after a drag reorder mutates row order (parent may track for apply-time renumbering). */
  onReorder?: () => void
}

export function OohExpertGrid({ feeooh, ...rest }: OohExpertGridProps) {
  return (
    <ExpertGrid
      config={OOH_EXPERT_CHANNEL_CONFIG}
      feePercent={feeooh}
      {...rest}
    />
  )
}
