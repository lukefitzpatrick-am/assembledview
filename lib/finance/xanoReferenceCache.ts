import axios from "axios"
import { omitClientBrainFromList } from "@/lib/clients/omitClientBrain"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"

const CACHE_TTL_MS = 30_000

let clientsCacheEntry: { expiresAt: number; value: any[] } | null = null
let clientsInFlightPromise: Promise<any[]> | null = null

let publishersCacheEntry: { expiresAt: number; value: any[] } | null = null
let publishersInFlightPromise: Promise<any[]> | null = null

export async function getCachedClients(): Promise<any[]> {
  const now = Date.now()
  if (clientsCacheEntry && clientsCacheEntry.expiresAt > now) {
    return clientsCacheEntry.value
  }
  if (clientsInFlightPromise) {
    return clientsInFlightPromise
  }

  const promise = (async (): Promise<any[]> => {
    try {
      const res = await axios.get(getXanoClientsCollectionUrl(), {
        headers: xanoAuthHeaderRecord(),
      })
      const raw = res.data
      const unstripped: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : []
      // Never cache multi-KB client_brain blobs on the list path.
      const data = omitClientBrainFromList(unstripped)
      // Only successful fetches reach here, so caching the result is safe.
      clientsCacheEntry = { expiresAt: Date.now() + CACHE_TTL_MS, value: data }
      return data
    } catch (e: any) {
      // Do not cache an empty list produced by an error. Next call retries.
      console.error("[ref-cache] getCachedClients fetch failed", e?.response?.status, e?.message)
      return []
    } finally {
      clientsInFlightPromise = null
    }
  })()

  clientsInFlightPromise = promise
  return promise
}

/** Drop clients list cache after PATCH (e.g. marketing brain save). */
export function invalidateCachedClients() {
  clientsCacheEntry = null
}

export async function getCachedPublishers(): Promise<any[]> {
  const now = Date.now()
  if (publishersCacheEntry && publishersCacheEntry.expiresAt > now) {
    return publishersCacheEntry.value
  }
  if (publishersInFlightPromise) {
    return publishersInFlightPromise
  }

  const promise = (async (): Promise<any[]> => {
    try {
      const res = await axios
        .get(xanoUrl("get_publishers", "XANO_CLIENTS_BASE_URL"), {
          headers: xanoAuthHeaderRecord(),
        })
        .catch(() => ({ data: [] as any[] }))
      const data = Array.isArray(res.data) ? res.data : []
      publishersCacheEntry = { expiresAt: Date.now() + CACHE_TTL_MS, value: data }
      return data
    } finally {
      publishersInFlightPromise = null
    }
  })()

  publishersInFlightPromise = promise
  return promise
}
