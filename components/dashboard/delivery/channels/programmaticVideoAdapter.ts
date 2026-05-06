import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { ChannelSectionData } from "./types"
import { buildProgrammaticChannelSection } from "./programmaticAdapterShared"

export function buildProgrammaticVideoSection(input: {
  progVideoLineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  filterRange: DateRange
  kpiTargets: KPITargetsMap | undefined
  pacingWindow: {
    asAtISO: string
    campaignStartISO: string
    campaignEndISO: string
  }
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  return buildProgrammaticChannelSection({
    key: "programmatic-video",
    title: "Programmatic – Video",
    snowflakeChannel: "programmatic-video",
    mediaCurveKey: "progvideo",
    curveMetric: "views",
    rawLineItems: input.progVideoLineItems,
    combinedRows: input.combinedRows,
    campaignStart: input.campaignStart,
    campaignEnd: input.campaignEnd,
    filterRange: input.filterRange,
    kpiTargets: input.kpiTargets,
    pacingWindow: input.pacingWindow,
    brandColour: input.brandColour,
    lastSyncedAt: input.lastSyncedAt,
  })
}
