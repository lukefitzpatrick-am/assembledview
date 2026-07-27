"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import type { ComboboxOption } from "@/components/media-containers/ExpertGridCombobox"
import {
  PRODUCTION_EXPERT_CHANNEL_CONFIG,
  createEmptyProductionExpertRow,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { ProductionExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export { createEmptyProductionExpertRow }

export interface ProductionExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProductionExpertScheduleRow[]
  onRowsChange: (rows: ProductionExpertScheduleRow[]) => void
  /** Production type options (same as ProductionContainer mediaType combobox). */
  productionTypeOptions?: ComboboxOption[]
  onReorder?: () => void
}

export function ProductionExpertGrid({
  productionTypeOptions,
  ...rest
}: ProductionExpertGridProps) {
  return (
    <ExpertGrid
      config={PRODUCTION_EXPERT_CHANNEL_CONFIG}
      feePercent={0}
      extraComboboxOptions={
        productionTypeOptions
          ? { mediaType: productionTypeOptions }
          : undefined
      }
      {...rest}
    />
  )
}
