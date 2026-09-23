/**
 * Coalesced TTL cache for `/api/media-container-best-practice`.
 * Best-practice rows change rarely — default 10 minutes.
 * Serves last-known-good on upstream failure (`stale: true`).
 * Postgres.
 */

const DEFAULT_TTL_MS = 10 * 60_000

export type MediaContainerBestPracticeCacheResult = {
  data: any[]
  stale: boolean
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<MediaContainerBestPracticeCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.MEDIA_CONTAINER_BEST_PRACTICE_CACHE_TTL_MS
  if (raw == null || raw === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

async function fetchUpstream(): Promise<any[]> {
  const { fetchMediaContainerBestPracticeFromPostgres } = await import(
    "@/lib/data/writeMediaContainerBestPractice"
  )
  return fetchMediaContainerBestPracticeFromPostgres()
}

/**
 * Returns media-container best-practice rows, coalescing concurrent callers
 * onto one upstream fetch. Serves last-known-good on failure (`stale: true`);
 * rejects only when there has never been a successful fetch.
 */
export async function getCachedMediaContainerBestPractice(): Promise<MediaContainerBestPracticeCacheResult> {
  const now = Date.now()
  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return { data: cacheEntry.data, stale: false }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  const promise = (async (): Promise<MediaContainerBestPracticeCacheResult> => {
    try {
      const data = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[mediaContainerBestPracticeCache] upstream failed; serving last-known-good",
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

/** Drop cache so the next get hits upstream (e.g. after POST/PATCH/DELETE). */
export function invalidateMediaContainerBestPracticeCache() {
  cacheEntry = null
}
