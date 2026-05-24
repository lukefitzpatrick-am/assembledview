import type { CampaignKPI, ResolvedKPIRow } from "@/lib/kpi/types"

/**
 * Build a CampaignKPI payload from a pacing-modal-edited row.
 * Used by the pacing host's onSave: takes the row out of the modal and
 * shapes it for /api/kpis/campaign/sync.
 *
 * Identity fields are required by the sync endpoint's Zod schema. The
 * payload omits `id` — sync resolves PATCH vs POST by natural key
 * (mba_number, version_number, line_item_id).
 */
export function buildSyncPayloadFromEditedRow(row: ResolvedKPIRow): CampaignKPI {
  return {
    mp_client_name: row.mp_client_name,
    mba_number: row.mba_number,
    version_number: row.version_number,
    campaign_name: row.campaign_name,
    media_type: row.media_type,
    publisher: row.publisher,
    bid_strategy: row.bid_strategy,
    line_item_id: row.lineItemId,
    ctr: row.ctr,
    cpv: row.cpv,
    conversion_rate: row.conversion_rate,
    vtr: row.vtr,
    frequency: row.frequency,
  }
}
