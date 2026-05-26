import type { CampaignKPI } from "@/lib/kpi/types"
import type { KpiTargets } from "@/lib/pacing/campaigns/types"

/**
 * After sync returns, build the KpiTargets shape that the pacing row
 * displays. Mirrors the field mapping used at read time in
 * fetchSearchPacingCampaignRows.ts (snake_case → camelCase).
 */
export function applySyncedTargetsToRow(synced: CampaignKPI): KpiTargets {
  return {
    mediaType: synced.media_type ?? null,
    publisher: synced.publisher ?? null,
    bidStrategy: synced.bid_strategy ?? null,
    ctr: synced.ctr,
    cpv: synced.cpv,
    conversionRate: synced.conversion_rate,
    vtr: synced.vtr,
    frequency: synced.frequency,
  }
}
