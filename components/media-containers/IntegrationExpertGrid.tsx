"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import {
  INTEGRATION_EXPERT_CHANNEL_CONFIG,
  createEmptyIntegrationExpertRow,
  INTEGRATION_BUY_TYPE_OPTIONS,
  INTEGRATION_BID_STRATEGY_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { IntegrationExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyIntegrationExpertRow,
  INTEGRATION_BUY_TYPE_OPTIONS,
  INTEGRATION_BID_STRATEGY_OPTIONS,
}

export interface IntegrationExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeintegration: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: IntegrationExpertScheduleRow[]
  onRowsChange: (rows: IntegrationExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  onReorder?: () => void
}

export function IntegrationExpertGrid({
  feeintegration,
  ...rest
}: IntegrationExpertGridProps) {
  return (
    <ExpertGrid
      config={INTEGRATION_EXPERT_CHANNEL_CONFIG}
      feePercent={feeintegration}
      {...rest}
    />
  )
}
