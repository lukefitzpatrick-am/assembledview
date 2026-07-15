import "server-only"

import axios from "axios"
import { revalidateTag, unstable_cache } from "next/cache"
import { parseXanoListPayload, xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

/**
 * Durable TTL cache for `/api/media-container-best-practice`.
 * Best-practice rows change rarely — default 10 minutes.
 * Auth stays outside this cache. Serves last-known-good on upstream failure (`stale: true`).
 */

export const MEDIA_CONTAINER_BEST_PRACTICE_TAG = "media-container-best-practice"
const REVALIDATE_SECONDS = 600 // 10 min

export type MediaContainerBestPracticeCacheResult = {
  data: any[]
  stale: boolean
}

/** Process-local LKG for stale-on-failure within a warm instance. */
let lastKnownGood: any[] | null = null

async function fetchUpstream(): Promise<any[]> {
  const response = await axios.get(
    xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL"),
    {
      timeout: 60_000,
      headers: xanoAuthHeaderRecord(),
    }
  )
  const data = response.data
  if (Array.isArray(data)) return data
  return parseXanoListPayload(data)
}

/**
 * Returns media-container best-practice rows from the durable Data Cache.
 * Serves last-known-good on failure (`stale: true`); rejects only when there
 * has never been a successful fetch on this instance and Data Cache misses.
 */
export async function getCachedMediaContainerBestPractice(): Promise<MediaContainerBestPracticeCacheResult> {
  try {
    const cached = unstable_cache(
      async () => fetchUpstream(),
      ["media-container-best-practice"],
      { revalidate: REVALIDATE_SECONDS, tags: [MEDIA_CONTAINER_BEST_PRACTICE_TAG] }
    )
    const data = await cached()
    lastKnownGood = data
    return { data, stale: false }
  } catch (err) {
    if (lastKnownGood) {
      console.warn(
        "[mediaContainerBestPracticeCache] upstream failed; serving last-known-good",
        err instanceof Error ? err.message : err
      )
      return { data: lastKnownGood, stale: true }
    }
    throw err
  }
}

/** Drop durable + process-local cache so the next get hits upstream (e.g. after POST/PATCH/DELETE). */
export function invalidateMediaContainerBestPracticeCache() {
  lastKnownGood = null
  revalidateTag(MEDIA_CONTAINER_BEST_PRACTICE_TAG)
}
