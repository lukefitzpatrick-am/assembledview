import { omitClientBrainFromList } from "@/lib/clients/omitClientBrain"
import { readClientsList } from "@/lib/data/readClients"
import { readPublishersList } from "@/lib/data/readPublishers"

const CACHE_TTL_MS = 30_000

let clientsCacheEntry: { expiresAt: number; value: any[] } | null = null
let clientsInFlightPromise: Promise<any[]> | null = null

let publishersCacheEntry: { expiresAt: number; value: any[] } | null = null
let publishersInFlightPromise: Promise<any[]> | null = null

function asRows(body: unknown): unknown[] {
  return Array.isArray(body) ? body : []
}

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
      const res = await readClientsList()
      if (res.status >= 400) {
        console.error("[ref-cache] getCachedClients fetch failed", res.status)
        return []
      }
      const data = omitClientBrainFromList(asRows(res.body))
      clientsCacheEntry = { expiresAt: Date.now() + CACHE_TTL_MS, value: data }
      return data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error("[ref-cache] getCachedClients fetch failed", message)
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

/** Drop publishers list cache after publisher writes. */
export function invalidateCachedPublishers() {
  publishersCacheEntry = null
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
      const res = await readPublishersList()
      if (res.status >= 400) {
        console.error("[ref-cache] getCachedPublishers fetch failed", res.status)
        return []
      }
      const data = asRows(res.body)
      publishersCacheEntry = { expiresAt: Date.now() + CACHE_TTL_MS, value: data }
      return data
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error("[ref-cache] getCachedPublishers fetch failed", message)
      return []
    } finally {
      publishersInFlightPromise = null
    }
  })()

  publishersInFlightPromise = promise
  return promise
}
