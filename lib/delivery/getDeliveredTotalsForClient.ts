import "server-only"

import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import { getCachedDirectPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache"
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types"
import { getAsOfDate } from "@/lib/pacing/maths"
import { slugifyPlanClientName } from "@/lib/pacing/scope/slugifyPlanClientName"
import {
  combineDeliveredTotals,
  deliveredQueryWindow,
  hasFixedCostMediaTypeLabel,
  sumDeliveredTotals,
  sumDirectReportedSpendInRange,
  asOfForDeliveredRange,
  programmaticLineItemIdsFromSnapshot,
  type DeliveredTotals,
} from "@/lib/delivery/deliveredTotals"
import { boundedMap } from "@/lib/utils/boundedMap"

export type ClientDeliveredTotalsCampaignInput = {
  mbaNumber: string
  versionNumber?: number
  /** Xano `mediaTypes` labels (e.g. "Television", "Radio", "Search") from the dashboard campaign list. */
  mediaTypes: string[]
  /** Plan client name from the version row already loaded for this request. Not the dashboard URL slug. */
  planClientName?: string
}

export type ClientDeliveredTotals = DeliveredTotals & {
  /** Melbourne "as of" date (`getAsOfDate()`) — Snowflake facts refresh ~06:30 Melbourne daily. */
  asOf: string
  /** True when a snapshot, the direct leg, or a fixed-cost overlay failed. Totals are what succeeded. */
  partial: boolean
  /** Names of the sources that failed. Empty when `partial` is false. */
  failedSources: string[]
}

async function loadScopedDirectGroups(
  pacingSlugSet: Set<string>,
  failedSources: string[],
): Promise<DirectCampaignGroup[]> {
  if (pacingSlugSet.size === 0) {
    console.error("[getDeliveredTotalsForClient] direct leg failed", {
      leg: "direct",
      error: "no plan client names to scope the pacing slug set",
    })
    failedSources.push("direct")
    return []
  }
  try {
    return await getCachedDirectPacingRows(getAsOfDate(), pacingSlugSet, false)
  } catch (error) {
    console.error("[getDeliveredTotalsForClient] direct leg failed", {
      leg: "direct",
      error: error instanceof Error ? error.message : String(error),
    })
    failedSources.push("direct")
    return []
  }
}

/**
 * Delivered-to-date across ALL of a client's booked/approved/completed campaigns (dashboard
 * Task 3 — client KPI bar "Delivered" tile). Combines the same two existing delivered reads used
 * by `getDeliveredTotalsForCampaign` (digital via `loadDeliverySnapshot`, fixed-cost via
 * `getCachedDirectPacingRows`), but composed at the client level instead of calling
 * `getDeliveredTotalsForCampaign` per campaign, which would re-run the expensive whole-table
 * direct Snowflake read once per fixed-cost campaign. Here it runs at most once
 * for the whole client, through the pacing cache, scoped by plan-name slugs.
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
 * The direct cache is scoped with `slugifyPlanClientName` of each campaign's plan client name.
 * This function still drops groups whose MBA is not in the requested set.
 *
 * A failed snapshot, direct leg, or fixed-cost overlay is `partial: true` with `failedSources`.
 * Totals are only the sources that succeeded. Callers must not present that short sum as Delivered.
 */
export async function getDeliveredTotalsForClient(
  campaigns: ClientDeliveredTotalsCampaignInput[],
  range?: { startDate?: string | null; endDate?: string | null },
): Promise<ClientDeliveredTotals> {
  const window = deliveredQueryWindow(range?.startDate, range?.endDate)
  if (campaigns.length === 0) {
    return {
      spendToDate: 0,
      impressions: 0,
      hasDelivery: false,
      asOf: asOfForDeliveredRange(getAsOfDate(), window?.endDate),
      partial: false,
      failedSources: [],
    }
  }

  const mbaKeys = new Set(campaigns.map((c) => c.mbaNumber.trim().toLowerCase()))
  const needsFixedCost = campaigns.some((c) => hasFixedCostMediaTypeLabel(c.mediaTypes))
  const pacingSlugSet = new Set<string>()
  for (const campaign of campaigns) {
    const slug = slugifyPlanClientName(campaign.planClientName)
    if (slug) pacingSlugSet.add(slug)
  }
  const failedSources: string[] = []

  const [snapshots, directGroups] = await Promise.all([
    boundedMap(
      campaigns,
      async (c) => {
        try {
          const snapshot = await loadDeliverySnapshot({
            mbaNumber: c.mbaNumber,
            versionNumber: c.versionNumber,
            ...(window ?? {}),
          })
          if (snapshot.fixedCostOverlayFailed) {
            failedSources.push(`fixed-cost overlay ${c.mbaNumber}`)
          }
          return snapshot
        } catch (error) {
          console.error("[getDeliveredTotalsForClient] snapshot failed", {
            mba: c.mbaNumber,
            error: error instanceof Error ? error.message : String(error),
          })
          failedSources.push(`snapshot ${c.mbaNumber}`)
          return null
        }
      },
      3
    ),
    needsFixedCost
      ? loadScopedDirectGroups(pacingSlugSet, failedSources)
      : Promise.resolve<DirectCampaignGroup[]>([]),
  ])

  const snapshotByMba = new Map<string, (typeof snapshots)[number]>()
  campaigns.forEach((c, i) => {
    snapshotByMba.set(c.mbaNumber.trim().toLowerCase(), snapshots[i] ?? null)
  })

  const fixedCostByMba = new Map<string, number>()
  for (const group of directGroups) {
    const key = group.mbaNumber.trim().toLowerCase()
    if (!mbaKeys.has(key)) continue
    fixedCostByMba.set(
      key,
      (fixedCostByMba.get(key) ?? 0) +
        sumDirectReportedSpendInRange(
          group,
          window?.startDate,
          window?.endDate,
          programmaticLineItemIdsFromSnapshot(snapshotByMba.get(key) ?? null),
        ),
    )
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
  const asOf = asOfForDeliveredRange(
    snapshots.find((s): s is NonNullable<typeof s> => Boolean(s))?.asOf ?? getAsOfDate(),
    window?.endDate,
  )

  return { ...totals, asOf, partial: failedSources.length > 0, failedSources }
}
