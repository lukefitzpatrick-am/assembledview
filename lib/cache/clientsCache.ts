import "server-only"

import axios from "axios"
import { revalidateTag, unstable_cache } from "next/cache"
import { omitClientBrain } from "@/lib/clients/omitClientBrain"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"

/**
 * Durable TTL cache for `/api/clients` via Next `unstable_cache` (Vercel Data Cache).
 * Clients change infrequently — default 10 minutes.
 * Auth stays outside this cache. Serves last-known-good on upstream failure (`stale: true`).
 */

export const CLIENTS_TAG = "clients-list"
const REVALIDATE_SECONDS = 600 // 10 min

export type ClientsCacheResult = {
  data: any[]
  stale: boolean
}

/** Process-local LKG for stale-on-failure + sync peek within a warm instance. */
let lastKnownGood: any[] | null = null

function withClientSlug(raw: any) {
  const name = getClientDisplayName(raw)
  const xanoSlugOriginal = typeof raw?.slug === "string" ? raw.slug.trim() : ""
  const stripped = omitClientBrain(
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {},
  )

  return {
    ...stripped,
    slug: slugifyClientNameForUrl(name),
    ...(xanoSlugOriginal
      ? { xano_url_slug: slugifyClientNameForUrl(xanoSlugOriginal) }
      : {}),
  }
}

async function fetchUpstream(): Promise<any[]> {
  const response = await axios.get(getXanoClientsCollectionUrl(), {
    timeout: 60_000,
    headers: {
      "Content-Type": "application/json",
      ...xanoAuthHeaderRecord(),
    },
  })
  const payload = Array.isArray(response.data)
    ? response.data.map(withClientSlug)
    : []
  return payload
}

/**
 * Sync peek for pacing / RBAC helpers that prefer a warm cache without awaiting.
 * Returns null when empty (callers fall back to their own fetch).
 * Only reflects process-local LKG after a successful list fetch on this instance —
 * not the durable Data Cache across cold starts.
 */
export function getCachedClients(): any[] | null {
  return lastKnownGood
}

/** Drop durable + process-local cache so the next `getCachedClientsList` hits upstream. */
export function invalidateClientsCache() {
  lastKnownGood = null
  revalidateTag(CLIENTS_TAG)
}

/**
 * @deprecated Prefer `getCachedClientsList`. Kept for callers that mutate cache after a direct fetch.
 * Only updates process-local LKG; cannot write the durable Data Cache.
 */
export function setCachedClients(data: any[], _ttlMs?: number) {
  lastKnownGood = data
}

/**
 * Returns the full clients list from the durable Data Cache.
 * When `bypassCache` is true, skips Data Cache entirely, fetches upstream, then
 * invalidates the tag so subsequent normal gets refill with fresh data.
 * Serves last-known-good on failure (`stale: true`); rejects only when there
 * has never been a successful fetch on this instance and Data Cache misses.
 */
export async function getCachedClientsList(
  options: { bypassCache?: boolean } = {}
): Promise<ClientsCacheResult> {
  if (options.bypassCache) {
    try {
      const data = await fetchUpstream()
      lastKnownGood = data
      // Drop durable entry so the next non-bypass miss refills with this fresher data.
      revalidateTag(CLIENTS_TAG)
      return { data, stale: false }
    } catch (err) {
      if (lastKnownGood) {
        console.warn(
          "[clientsCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err
        )
        return { data: lastKnownGood, stale: true }
      }
      throw err
    }
  }

  try {
    const cached = unstable_cache(
      async () => fetchUpstream(),
      ["clients-list"],
      { revalidate: REVALIDATE_SECONDS, tags: [CLIENTS_TAG] }
    )
    const data = await cached()
    lastKnownGood = data
    return { data, stale: false }
  } catch (err) {
    if (lastKnownGood) {
      console.warn(
        "[clientsCache] upstream failed; serving last-known-good",
        err instanceof Error ? err.message : err
      )
      return { data: lastKnownGood, stale: true }
    }
    throw err
  }
}
