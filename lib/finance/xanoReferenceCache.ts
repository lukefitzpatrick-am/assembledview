import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

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
      const res = await axios
        .get(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL"))
        .catch(() => ({ data: [] as any[] }))
      const data = Array.isArray(res.data) ? res.data : []
      clientsCacheEntry = { expiresAt: Date.now() + CACHE_TTL_MS, value: data }
      return data
    } finally {
      clientsInFlightPromise = null
    }
  })()

  clientsInFlightPromise = promise
  return promise
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
        .get(xanoUrl("get_publishers", "XANO_CLIENTS_BASE_URL"))
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
