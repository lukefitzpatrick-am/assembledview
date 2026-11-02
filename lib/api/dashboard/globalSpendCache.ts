import "server-only"

import { unstable_cache } from "next/cache"
import { getGlobalMonthlyClientSpend } from "@/lib/api/dashboard/global"
import { fetchPlannedToDateByMba } from "@/lib/api/dashboard/plannedToDateFetch"
import type { PlannedToDateFy } from "@/lib/api/dashboard/plannedToDate"

export const DASHBOARD_GLOBAL_SPEND_TAG = "dashboard-global-spend"
const REVALIDATE_SECONDS = 300 // 5 min

/**
 * Cached global monthly client spend and planned-to-date.
 * Auth (middleware / route gates) must stay outside this cache — same pattern as pacingRowsCache.
 */
export async function getCachedGlobalMonthlyClientSpend() {
  const cached = unstable_cache(
    async () => getGlobalMonthlyClientSpend(),
    ["dashboard-global-monthly-client-spend"],
    { revalidate: REVALIDATE_SECONDS, tags: [DASHBOARD_GLOBAL_SPEND_TAG] }
  )
  return cached()
}

/** Cached per-MBA planned-to-date. `fy` is part of the cache key. Auth stays outside. */
export async function getCachedPlannedToDate(fy: PlannedToDateFy) {
  const cached = unstable_cache(
    async () => fetchPlannedToDateByMba(fy),
    ["dashboard-planned-to-date", String(fy)],
    { revalidate: REVALIDATE_SECONDS, tags: [DASHBOARD_GLOBAL_SPEND_TAG] }
  )
  return cached()
}
