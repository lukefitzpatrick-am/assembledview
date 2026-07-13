import axios from "axios"
import { parseXanoListPayload, xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { PublisherKpi } from "@/lib/kpi/types"

/**
 * Coalesced TTL cache for `GET /api/kpis/publisher` (unfiltered list).
 * Upstream returns ~500+ rows; default TTL 10 minutes.
 * Serves last-known-good on upstream failure (`stale: true`).
 */

const DEFAULT_TTL_MS = 10 * 60_000

export type PublisherKpiCacheResult = {
  data: PublisherKpi[]
  stale: boolean
}

type CacheEntry = {
  data: PublisherKpi[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<PublisherKpiCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.PUBLISHER_KPI_CACHE_TTL_MS
  if (raw == null || raw === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

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
 * Returns the full publisher_kpi list, coalescing concurrent callers onto one
 * upstream fetch. Serves last-known-good on failure (`stale: true`); rejects
 * only when there has never been a successful fetch.
 */
export async function getCachedPublisherKpis(): Promise<PublisherKpiCacheResult> {
  const now = Date.now()
  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return { data: cacheEntry.data, stale: false }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  const promise = (async (): Promise<PublisherKpiCacheResult> => {
    try {
      const data = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[publisherKpiCache] upstream failed; serving last-known-good",
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
