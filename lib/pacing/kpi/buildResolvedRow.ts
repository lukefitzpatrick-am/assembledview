import type { ResolvedKPIRow } from "@/lib/kpi/types"
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import { deliveryFlagsFromClient } from "@/lib/delivery/deliveryFlags"
import { packageHasNoUnitTarget, type PackageUnitTargetOptions } from "@/lib/delivery/packageUnitTarget"

/**
 * Build a ResolvedKPIRow for the pacing modal directly from pacing row state.
 * Skips the resolver and tier fetches — the row already has the values needed.
 *
 * Q6 lock-in: media_type is hardcoded to "search" for the Search pacing surface;
 * publisher comes from row.platform.
 *
 * When kpiTargets is null (empty-state "Create targets" flow), metrics default
 * to null so the modal renders blank inputs and the user explicitly types values.
 *
 * B23fix P14: a package line with `expert_package_quantity` on plans no
 * deliverables (no unit target). Unset options read the browser switch snapshot.
 */
export function buildResolvedKpiRowFromPacing(
  row: SearchPacingCampaignRow,
  options: PackageUnitTargetOptions = { packageNoUnitTarget: deliveryFlagsFromClient().packageNoUnitTarget },
): ResolvedKPIRow {
  const targets = row.kpiTargets
  const noUnitTarget = packageHasNoUnitTarget(row.buyType, options)
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
    deliverables: noUnitTarget
      ? 0
      : row.bursts.reduce(
          (sum, b) => sum + (b.calculatedValue ?? 0),
          0,
        ),
    buyType: row.buyType,
    source: targets ? "saved" : "default",
    isManuallyEdited: false,
    ctr: targets?.ctr ?? null,
    // CPV target is the plan CPV (23 Oct); saved cpv is never read.
    cpv: null,
    conversion_rate: targets?.conversionRate ?? null,
    vtr: targets?.vtr ?? null,
    frequency: targets?.frequency ?? null,
    calculatedClicks: null,
    calculatedViews: null,
    calculatedReach: null,
  }
}
