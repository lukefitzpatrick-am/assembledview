import type { ResolvedKPIRow } from "@/lib/kpi/types"
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"

/**
 * Build a ResolvedKPIRow for the pacing modal directly from pacing row state.
 * Skips the resolver and tier fetches — the row already has the values needed.
 *
 * Q6 lock-in: media_type is hardcoded to "search" for the Search pacing surface;
 * publisher comes from row.platform.
 *
 * When kpiTargets is null (empty-state "Create targets" flow), metrics default
 * to null so the modal renders blank inputs and the user explicitly types values.
 */
export function buildResolvedKpiRowFromPacing(
  row: SearchPacingCampaignRow,
): ResolvedKPIRow {
  const targets = row.kpiTargets
  return {
    mp_client_name: row.clientName,
    mba_number: row.mbaNumber,
    version_number: row.mediaPlanVersionNumber,
    campaign_name: row.campaignName,
    media_type: "search",
    publisher: row.platform,
    bid_strategy: row.bidStrategy,
    lineItemId: row.lineItemId,
    lineItemLabel: row.creativeTargeting || row.creative || row.lineItemId,
    spend: row.totalLineItemBudget,
    deliverables: row.bursts.reduce(
      (sum, b) => sum + (b.calculatedValue ?? 0),
      0,
    ),
    buyType: row.buyType,
    source: targets ? "saved" : "default",
    isManuallyEdited: false,
    ctr: targets?.ctr ?? null,
    cpv: targets?.cpv ?? null,
    conversion_rate: targets?.conversionRate ?? null,
    vtr: targets?.vtr ?? null,
    frequency: targets?.frequency ?? null,
    calculatedClicks: null,
    calculatedViews: null,
    calculatedReach: null,
  }
}
