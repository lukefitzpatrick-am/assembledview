import { fanOutKpiPayload } from "./fanOut"
import {
  buildKpiLineItemsByMediaType,
  type KpiLineItemsPair,
} from "./lineItemsForFanOut"
import type { CampaignKPI, ResolvedKPIRow } from "./types"

export type CampaignKpiSaveIdentity = {
  mp_client_name: string
  mba_number: string
  version_number: number
  campaign_name: string
}

/**
 * Shared fan-out for media-plan KPI writes (modal persist and plan save).
 * Callers pass the version they are targeting — modal persist uses the
 * version currently being edited; plan save uses the version it just wrote.
 */
export function buildCampaignKpiSavePayload(args: {
  kpiRows: ResolvedKPIRow[]
  identity: CampaignKpiSaveIdentity
  mediaPairs: Record<string, KpiLineItemsPair>
}): CampaignKPI[] {
  return fanOutKpiPayload(
    args.kpiRows,
    args.identity,
    buildKpiLineItemsByMediaType(args.mediaPairs),
  )
}
