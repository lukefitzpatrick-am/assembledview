/**
 * Browser-side GET JSON coalescing + short TTL cache.
 * Matches the in-flight map pattern used by `fetchMediaPlanMbaCoalesced` and
 * `fetchAllPublishers` — collapses Strict Mode remounts and parallel callers
 * for the same URL into one network request per page load window.
 */

type CacheEntry = {
  data: unknown
  expiresAt: number
}

const DEFAULT_TTL_MS = 60_000

const inflight = new Map<string, Promise<unknown>>()
const cache = new Map<string, CacheEntry>()

export type CoalescedGetJsonOptions = {
  /** Soft TTL after a successful response (default 60s). */
  ttlMs?: number
  init?: RequestInit
}

export async function coalescedGetJson<T>(
  url: string,
  options: CoalescedGetJsonOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const now = Date.now()
  const cached = cache.get(url)
  if (cached && cached.expiresAt > now) {
    return cached.data as T
  }

  let shared = inflight.get(url)
  if (!shared) {
    const { init, ttlMs: _ttl } = options
    shared = (async () => {
      const response = await fetch(url, {
        ...init,
        headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      })
      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new Error(
          details.trim() || `Request failed with status ${response.status}`
        )
      }
      const data = (await response.json()) as unknown
      cache.set(url, { data, expiresAt: Date.now() + ttlMs })
      return data
    })().finally(() => {
      inflight.delete(url)
    })
    inflight.set(url, shared)
  }

  return shared as Promise<T>
}

/** Drop cached + in-flight entry so the next call hits the network. */
export function invalidateCoalescedGetJson(url: string): void {
  cache.delete(url)
  inflight.delete(url)
}
