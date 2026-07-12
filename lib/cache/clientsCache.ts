import axios from "axios"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"

/**
 * Coalesced TTL cache for `/api/clients`.
 * Clients change infrequently — default 10 minutes.
 * Serves last-known-good on upstream failure (`stale: true`).
 */

const DEFAULT_TTL_MS = 10 * 60_000

export type ClientsCacheResult = {
  data: any[]
  stale: boolean
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<ClientsCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.CLIENTS_CACHE_TTL_MS
  if (raw == null || raw === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

function withClientSlug(raw: any) {
  const name = getClientDisplayName(raw)
  const xanoSlugOriginal = typeof raw?.slug === "string" ? raw.slug.trim() : ""

  return {
    ...raw,
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
 * Returns null when empty or expired (callers fall back to their own fetch).
 */
export function getCachedClients(): any[] | null {
  if (!cacheEntry) return null
  if (Date.now() - cacheEntry.fetchedAt >= cacheTtlMs()) return null
  return cacheEntry.data
}

/** Drop cache so the next `getCachedClientsList` hits upstream. */
export function invalidateClientsCache() {
  cacheEntry = null
}

/**
 * @deprecated Prefer `getCachedClientsList`. Kept for callers that mutate cache after a direct fetch.
 */
export function setCachedClients(data: any[], _ttlMs?: number) {
  cacheEntry = { data, fetchedAt: Date.now() }
}

/**
 * Returns the full clients list, coalescing concurrent callers onto one
 * upstream fetch. Serves last-known-good on failure (`stale: true`); rejects
 * only when there has never been a successful fetch.
 */
export async function getCachedClientsList(
  options: { bypassCache?: boolean } = {}
): Promise<ClientsCacheResult> {
  const now = Date.now()
  if (
    !options.bypassCache &&
    cacheEntry &&
    now - cacheEntry.fetchedAt < cacheTtlMs()
  ) {
    return { data: cacheEntry.data, stale: false }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  const promise = (async (): Promise<ClientsCacheResult> => {
    try {
      const data = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[clientsCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err
        )
        return { data: cacheEntry.data, stale: true }
      }
      throw err
    } finally {
      inFlightPromise = null
    }
  })()

  inFlightPromise = promise
  return promise
}
