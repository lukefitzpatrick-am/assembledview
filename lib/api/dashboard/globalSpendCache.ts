import "server-only"

import { unstable_cache } from "next/cache"
import {
  getGlobalMonthlyClientSpend,
  getGlobalMonthlyPublisherSpend,
} from "@/lib/api/dashboard/global"

export const DASHBOARD_GLOBAL_SPEND_TAG = "dashboard-global-spend"
const REVALIDATE_SECONDS = 300 // 5 min

/**
 * Cached global monthly spend aggregates.
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

export async function getCachedGlobalMonthlyPublisherSpend() {
  const cached = unstable_cache(
    async () => getGlobalMonthlyPublisherSpend(),
    ["dashboard-global-monthly-publisher-spend"],
    { revalidate: REVALIDATE_SECONDS, tags: [DASHBOARD_GLOBAL_SPEND_TAG] }
  )
  return cached()
}
