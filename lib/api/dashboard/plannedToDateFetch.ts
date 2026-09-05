import "server-only"

import { readPlanMasters, readPlanVersions } from "@/lib/data/readMediaPlans"
import { publishedVersionFromMaster } from "@/lib/mediaplan/publishedVersionGuard"
import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"
import {
  buildPlannedToDateByMba,
  type PlannedToDateFy,
} from "./plannedToDate"

/**
 * Load every published commercial campaign's planned-to-date from delivery
 * schedules. Tenant filtering is the caller's job (`allowedMbaKeys`).
 */
export async function fetchPlannedToDateByMba(
  fy: PlannedToDateFy,
  allowedMbaKeys?: Set<string>,
): Promise<Record<string, number>> {
  const [versions, masters] = await Promise.all([
    readPlanVersions(),
    readPlanMasters(),
  ])

  const publishedByMba = new Map<string, number>()
  const mastersByMba = new Map<string, { campaign_status?: unknown }>()
  for (const master of masters) {
    const key = mbaJoinKey(master?.mba_number)
    if (!key) continue
    const published = publishedVersionFromMaster(master)
    if (published > 0) publishedByMba.set(key, published)
    mastersByMba.set(key, { campaign_status: master?.campaign_status })
  }

  return buildPlannedToDateByMba(versions, {
    fy,
    publishedByMba,
    mastersByMba,
    allowedMbaKeys,
  })
}
