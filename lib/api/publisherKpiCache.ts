import "server-only"

import axios from "axios"
import { unstable_cache } from "next/cache"
import { parseXanoListPayload, xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { PublisherKpi } from "@/lib/kpi/types"

/**
 * Durable TTL cache for `GET /api/kpis/publisher` (unfiltered list).
 * Upstream returns ~500+ rows; default TTL 10 minutes.
 * Auth stays outside this cache. Serves last-known-good on upstream failure (`stale: true`).
 */

export const PUBLISHER_KPI_TAG = "publisher-kpi"
const REVALIDATE_SECONDS = 600 // 10 min

export type PublisherKpiCacheResult = {
  data: PublisherKpi[]
  stale: boolean
}

/** Process-local LKG for stale-on-failure within a warm instance. */
let lastKnownGood: PublisherKpi[] | null = null

async function fetchUpstream(): Promise<PublisherKpi[]> {
  const response = await axios.get(xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL"), {
    timeout: 60_000,
    headers: xanoAuthHeaderRecord(),
  })
  const data = response.data
  if (Array.isArray(data)) return data as PublisherKpi[]
  return parseXanoListPayload(data) as PublisherKpi[]
}

/**
 * Returns the full publisher_kpi list from the durable Data Cache.
 * Serves last-known-good on failure (`stale: true`); rejects only when there
 * has never been a successful fetch on this instance and Data Cache misses.
 */
export async function getCachedPublisherKpis(): Promise<PublisherKpiCacheResult> {
  try {
    const cached = unstable_cache(
      async () => fetchUpstream(),
      ["publisher-kpi"],
      { revalidate: REVALIDATE_SECONDS, tags: [PUBLISHER_KPI_TAG] }
    )
    const data = await cached()
    lastKnownGood = data
    return { data, stale: false }
  } catch (err) {
    if (lastKnownGood) {
      console.warn(
        "[publisherKpiCache] upstream failed; serving last-known-good",
        err instanceof Error ? err.message : err
      )
      return { data: lastKnownGood, stale: true }
    }
    throw err
  }
}
