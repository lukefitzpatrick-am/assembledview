import "server-only"

import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import { fetchDirectPacingRows } from "@/lib/pacing/direct/fetchDirectPacingRows"
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types"
import { getAsOfDate } from "@/lib/pacing/maths"
import { combineDeliveredTotals, hasFixedCostMediaLineItems, type DeliveredTotals } from "@/lib/delivery/deliveredTotals"

export type GetDeliveredTotalsForCampaignInput = {
  mbaNumber: string
  versionNumber?: number
  mpSearchEnabled?: boolean
  /** `campaignData.lineItems` — used only to decide whether the fixed-cost read is needed. */
  lineItemsMap?: Record<string, unknown[] | undefined> | null
}

export type DeliveredTotalsForCampaign = DeliveredTotals & {
  /** Melbourne "as of" date (`getAsOfDate()`) — Snowflake facts refresh ~06:30 Melbourne daily. */
  asOf: string
  /** Digital snapshot clicks (0 when snapshot missing) — for read-only KPI pacing (B1-1). */
  clicks: number
  /** Digital snapshot conversions/`results` (0 when snapshot missing). */
  results: number
  /** Digital 3s video views — not a VTR/CPV numerator; exposed for mapping honesty only. */
  video3sViews: number
}

/**
 * Delivered-to-date for ONE campaign (single MBA), combining the two existing delivered reads:
 *  - `loadDeliverySnapshot` for digital media (social/search/programmatic/ad-serving).
 *  - `fetchDirectPacingRows` for fixed-cost media (Newspaper/TV/Radio), only when the campaign
 *    actually has fixed-cost line items — skips the (expensive, whole-table) Snowflake read
 *    entirely for purely-digital campaigns.
 *
 * Tenant safety: this function does NOT do its own auth check — callers (the campaign page,
 * the `/api/dashboard/[slug]/delivered` route) must already have verified the caller is
 * entitled to `mbaNumber` before calling this, exactly like the existing
 * `loadDeliverySnapshot` call site on `app/dashboard/[slug]/[mba_number]/page.tsx` does today.
 * `fetchDirectPacingRows` itself reads across all clients' fixed-cost facts (same as the
 * `/pacing/direct` admin tab); this function filters the result down to the single requested
 * `mbaNumber` before returning, so no other tenant's figures ever leave this function.
 */
export async function getDeliveredTotalsForCampaign(
  input: GetDeliveredTotalsForCampaignInput,
): Promise<DeliveredTotalsForCampaign> {
  const mbaKey = input.mbaNumber.trim().toLowerCase()
  const needsFixedCost = hasFixedCostMediaLineItems(input.lineItemsMap)

  const [snapshot, directGroups] = await Promise.all([
    loadDeliverySnapshot({
      mbaNumber: input.mbaNumber,
      versionNumber: input.versionNumber,
      mpSearchEnabled: input.mpSearchEnabled,
    }).catch(() => null),
    needsFixedCost
      ? fetchDirectPacingRows({
          asOfDate: getAsOfDate(),
          allowedClientSlugs: null,
          includeHistorical: false,
        }).catch((): DirectCampaignGroup[] => [])
      : Promise.resolve<DirectCampaignGroup[]>([]),
  ])

  const fixedCostGroup = directGroups.find((group) => group.mbaNumber.trim().toLowerCase() === mbaKey)

  const totals = combineDeliveredTotals(
    snapshot
      ? { spendToDate: snapshot.planTotals.spendToDate, impressions: snapshot.planTotals.impressions }
      : null,
    fixedCostGroup?.totalReported ?? 0,
  )

  return {
    ...totals,
    asOf: snapshot?.asOf ?? getAsOfDate(),
    clicks: snapshot?.planTotals.clicks ?? 0,
    results: snapshot?.planTotals.results ?? 0,
    video3sViews: snapshot?.planTotals.video3sViews ?? 0,
  }
}
