import axios from "axios"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

/**
 * Coalesced TTL cache for `/api/publishers`.
 * Publishers change rarely — default 10 minutes.
 * Always caches the full upstream payload; strips best-practice blobs when
 * `light: true` (default) for the edit-page critical path.
 */

const DEFAULT_TTL_MS = 10 * 60_000

const LIGHT_PUBLISHER_KEYS = [
  "id",
  "publisherid",
  "publisher_id",
  "publisher_name",
  "publisherName",
  "name",
  "billingagency",
  "billing_agency",
  "billingAgency",
  "publisher_colour",
  "publishertype",
] as const

export type PublishersCacheResult = {
  data: any[]
  stale: boolean
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<PublishersCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.PUBLISHERS_CACHE_TTL_MS
  if (raw == null || raw === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

function isPubFlagKey(key: string): boolean {
  return key.startsWith("pub_") || key.startsWith("PUB_")
}

function isBestPracticeKey(key: string): boolean {
  const lower = key.toLowerCase()
  return lower.includes("best_practice") || lower.includes("bestpractice")
}

export function toLightPublisher(row: any): any {
  if (!row || typeof row !== "object") return row
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    if (isBestPracticeKey(key)) continue
    if (
      LIGHT_PUBLISHER_KEYS.includes(key as (typeof LIGHT_PUBLISHER_KEYS)[number]) ||
      isPubFlagKey(key)
    ) {
      out[key] = row[key]
    }
  }
  if (row.id != null && out.id == null) out.id = row.id
  if (row.publisher_name != null && out.publisher_name == null) {
    out.publisher_name = row.publisher_name
  }
  return out
}

async function fetchUpstreamFull(): Promise<any[]> {
  const response = await axios.get(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL"), {
    timeout: 60_000,
    headers: xanoAuthHeaderRecord(),
  })
  return Array.isArray(response.data) ? response.data : []
}

/**
 * @param light When true (default), strip best-practice blobs and keep name/id/flags only.
 */
export async function getCachedPublishersList(
  options: { light?: boolean } = {}
): Promise<PublishersCacheResult> {
  const light = options.light !== false
  const project = (rows: any[], stale: boolean): PublishersCacheResult => ({
    data: light ? rows.map(toLightPublisher) : rows,
    stale,
  })

  const now = Date.now()
  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return project(cacheEntry.data, false)
  }

  if (inFlightPromise) {
    const result = await inFlightPromise
    return project(result.data, result.stale)
  }

  const promise = (async (): Promise<PublishersCacheResult> => {
    try {
      const data = await fetchUpstreamFull()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[publishersCache] upstream failed; serving last-known-good",
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
  const result = await promise
  return project(result.data, result.stale)
}
