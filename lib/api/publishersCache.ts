import "server-only"

import axios from "axios"
import { revalidateTag, unstable_cache } from "next/cache"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

/**
 * Durable TTL cache for `/api/publishers` via Next `unstable_cache` (Vercel Data Cache).
 * Publishers change rarely — default 10 minutes.
 * Auth stays outside this cache. Serves last-known-good on upstream failure (`stale: true`).
 */

export const PUBLISHERS_TAG = "publishers-list"
const REVALIDATE_SECONDS = 600 // 10 min

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

/** Process-local LKG for stale-on-failure within a warm instance. */
const lastKnownGoodByKey: Record<string, any[]> = {}

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
 *   Included in the durable cache key so light/full are separate Data Cache entries.
 */
export async function getCachedPublishersList(
  options: { light?: boolean } = {}
): Promise<PublishersCacheResult> {
  const light = options.light !== false
  const lightKey = light ? "light" : "full"

  try {
    const cached = unstable_cache(
      async () => {
        const rows = await fetchUpstreamFull()
        return light ? rows.map(toLightPublisher) : rows
      },
      ["publishers-list", lightKey],
      { revalidate: REVALIDATE_SECONDS, tags: [PUBLISHERS_TAG] }
    )
    const data = await cached()
    lastKnownGoodByKey[lightKey] = data
    return { data, stale: false }
  } catch (err) {
    const lkg = lastKnownGoodByKey[lightKey]
    if (lkg) {
      console.warn(
        "[publishersCache] upstream failed; serving last-known-good",
        err instanceof Error ? err.message : err
      )
      return { data: lkg, stale: true }
    }
    throw err
  }
}

/** Drop durable + process-local cache (e.g. after POST/PUT). */
export function invalidatePublishersCache() {
  delete lastKnownGoodByKey.light
  delete lastKnownGoodByKey.full
  revalidateTag(PUBLISHERS_TAG)
}
