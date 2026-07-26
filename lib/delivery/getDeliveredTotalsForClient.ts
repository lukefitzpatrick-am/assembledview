import "server-only"

import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import { fetchDirectPacingRows } from "@/lib/pacing/direct/fetchDirectPacingRows"
import { getAsOfDate } from "@/lib/pacing/maths"
import {
  combineDeliveredTotals,
  hasFixedCostMediaTypeLabel,
  sumDeliveredTotals,
  type DeliveredTotals,
} from "@/lib/delivery/deliveredTotals"

export type ClientDeliveredTotalsCampaignInput = {
  mbaNumber: string
  versionNumber?: number
  /** Xano `mediaTypes` labels (e.g. "Television", "Radio", "Search") from the dashboard campaign list. */
  mediaTypes: string[]
}

export type ClientDeliveredTotals = DeliveredTotals & {
  /** Melbourne "as of" date (`getAsOfDate()`) — Snowflake facts refresh ~06:30 Melbourne daily. */
  asOf: string
}

/**
 * Delivered-to-date across ALL of a client's booked/approved/completed campaigns (dashboard
 * Task 3 — client KPI bar "Delivered" tile). Combines the same two existing delivered reads used
 * by `getDeliveredTotalsForCampaign` (digital via `loadDeliverySnapshot`, fixed-cost via
 * `fetchDirectPacingRows`), but composed at the client level instead of calling
 * `getDeliveredTotalsForCampaign` per campaign, which would re-run the expensive whole-table
 * `fetchDirectPacingRows` Snowflake read once per fixed-cost campaign. Here it runs at most once
 * for the whole client.
 *
 * Simplification: `mpSearchEnabled` is not available on the dashboard campaign list (it lives on
 * the per-MBA version row, not `media_plan_versions` list rows used to build `ClientDashboardData`)
 * so this omits it, which defaults `loadDeliverySnapshot` to "search enabled" — the same default
 * used when no explicit flag is known. Worst case this over-counts search delivery for a campaign
 * that explicitly disabled search after having search line items; it never fabricates a figure.
 *
 * Tenant safety: callers MUST have already verified the caller is entitled to `slug` (and thus
 * every `mbaNumber` passed in, since they all come from that same tenant-scoped
 * `getClientDashboardData(slug)` call) before calling this — see `/api/dashboard/[slug]/delivered`.
 * `fetchDirectPacingRows` itself reads across all clients' fixed-cost facts; this function filters
 * its result down to only the requested `mbaNumber`s before returning, so no other tenant's
 * figures ever leave this function.
 */
export async function getDeliveredTotalsForClient(
  campaigns: ClientDeliveredTotalsCampaignInput[],
): Promise<ClientDeliveredTotals> {
  if (campaigns.length === 0) {
    return { spendToDate: 0, impressions: 0, hasDelivery: false, asOf: getAsOfDate() }
  }

  const mbaKeys = new Set(campaigns.map((c) => c.mbaNumber.trim().toLowerCase()))
  const needsFixedCost = campaigns.some((c) => hasFixedCostMediaTypeLabel(c.mediaTypes))

  const [snapshots, directGroups] = await Promise.all([
    Promise.all(
      campaigns.map((c) =>
        loadDeliverySnapshot({ mbaNumber: c.mbaNumber, versionNumber: c.versionNumber }).catch(() => null),
      ),
    ),
    needsFixedCost
      ? fetchDirectPacingRows({ asOfDate: getAsOfDate(), allowedClientSlugs: null, includeHistorical: false }).catch(
          () => [],
        )
      : Promise.resolve([]),
  ])

  const fixedCostByMba = new Map<string, number>()
  for (const group of directGroups) {
    const key = group.mbaNumber.trim().toLowerCase()
    if (!mbaKeys.has(key)) continue // tenant safety: only campaigns this caller was scoped to
    fixedCostByMba.set(key, (fixedCostByMba.get(key) ?? 0) + group.totalReported)
  }

  const perCampaign = campaigns.map((c, i) => {
    const snapshot = snapshots[i]
    const mbaKey = c.mbaNumber.trim().toLowerCase()
    return combineDeliveredTotals(
      snapshot ? { spendToDate: snapshot.planTotals.spendToDate, impressions: snapshot.planTotals.impressions } : null,
      fixedCostByMba.get(mbaKey) ?? 0,
    )
  })

  const totals = sumDeliveredTotals(perCampaign)
  const asOf = snapshots.find((s): s is NonNullable<typeof s> => Boolean(s))?.asOf ?? getAsOfDate()

  return { ...totals, asOf }
}
