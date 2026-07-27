"use client"

import { ExpertGrid } from "@/components/media-containers/ExpertGrid"
import type { ComboboxOption } from "@/components/ui/combobox"
import {
  MAGAZINES_EXPERT_CHANNEL_CONFIG,
  createEmptyMagazinesExpertRow,
  MAGAZINES_BUY_TYPE_OPTIONS,
  type ExpertGridTitleOption,
} from "@/lib/mediaplan/expertGridChannelConfig"
import type { MagazinesExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"

export {
  createEmptyMagazinesExpertRow,
  MAGAZINES_BUY_TYPE_OPTIONS,
}

export interface MagazinesExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feemagazines: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: MagazinesExpertScheduleRow[]
  onRowsChange: (rows: MagazinesExpertScheduleRow[]) => void
  /** Publisher/platform/network names for combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
  /** Title options (network-filtered) for the title combobox */
  magazines?: ExpertGridTitleOption[]
  /** Ad size options for the size combobox-dynamic column */
  adSizes?: ComboboxOption[]
  onReorder?: () => void
}

export function MagazinesExpertGrid({
  feemagazines,
  magazines = [],
  adSizes = [],
  ...rest
}: MagazinesExpertGridProps) {
  return (
    <ExpertGrid
      config={MAGAZINES_EXPERT_CHANNEL_CONFIG}
      feePercent={feemagazines}
      titles={magazines}
      extraComboboxOptions={{ size: adSizes }}
      {...rest}
    />
  )
}
