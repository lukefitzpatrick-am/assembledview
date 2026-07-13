import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import type { DateRange } from "@/lib/dashboard/dateFilter"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { ChannelSectionData } from "./types"
import { buildProgrammaticChannelSection } from "./programmaticAdapterShared"

export function buildProgrammaticDisplaySection(input: {
  progDisplayLineItems: unknown[] | undefined
  combinedRows: CombinedPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  filterRange: DateRange
  kpiVersionNumber: number
  kpiTargets: KPITargetsMap | undefined
  lineItemTargets: Map<string, CampaignKPI> | undefined
  pacingWindow: {
    asAtISO: string
    campaignStartISO: string
    campaignEndISO: string
  }
  brandColour?: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  return buildProgrammaticChannelSection({
    key: "programmatic-display",
    title: "Programmatic – Display",
    snowflakeChannel: "programmatic-display",
    mediaCurveKey: "progdisplay",
    curveMetric: "clicks",
    rawLineItems: input.progDisplayLineItems,
    combinedRows: input.combinedRows,
    campaignStart: input.campaignStart,
    campaignEnd: input.campaignEnd,
    mbaNumber: input.mbaNumber,
    filterRange: input.filterRange,
    kpiVersionNumber: input.kpiVersionNumber,
    kpiTargets: input.kpiTargets,
    lineItemTargets: input.lineItemTargets,
    pacingWindow: input.pacingWindow,
    brandColour: input.brandColour,
    lastSyncedAt: input.lastSyncedAt,
  })
}
