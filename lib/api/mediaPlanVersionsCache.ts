import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

/**
 * Shared coalesced cache for the dashboard's latest media_plan_versions list.
 *
 * Default upstream: `media_plan_versions_latest` (one row per mba_number, highest
 * version_number), paged, with `include_schedules=false`. Schedule JSON is also
 * stripped client-side after fetch so dashboard/list payloads stay small even if
 * Xano ignores the flag.
 *
 * Serves stale-while-revalidate: when a populated entry is past TTL, callers get
 * the cached value immediately and a background refresh runs. Only a true cold
 * start (never filled) blocks on the upstream round-trip.
 *
 * Consumers of this cache must treat the value as a latest-version-per-MBA list
 * of scalar fields only. Call sites that need schedules or version history must
 * hit `media_plan_versions` (paged) directly — never this cache.
 */

const DEFAULT_TTL_MS = 60_000
/** per_page ceiling on _latest measured 12 Jul 2026: 100 ✅ / 150 ❌ timeout. 171-row latest set = 2 requests. */
const PAGE_SIZE = 100

const SCHEDULE_KEYS = [
  "deliverySchedule",
  "delivery_schedule",
  "billingSchedule",
  "billing_schedule",
] as const

export type MediaPlanVersionsCacheResult = {
  data: any[]
  stale: boolean
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<MediaPlanVersionsCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.MEDIA_PLAN_VERSIONS_CACHE_TTL_MS
  if (raw == null || raw === "") return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS
}

function versionsPath(): string {
  const override = process.env.XANO_MEDIA_PLAN_VERSIONS_PATH?.trim()
  return override && override.length > 0
    ? override.replace(/^\//, "")
    : "media_plan_versions_latest"
}

function versionsUrl(): string {
  return xanoUrl(versionsPath(), ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
}

function stripScheduleFields(row: any): any {
  if (!row || typeof row !== "object") return row
  const next = { ...row }
  for (const key of SCHEDULE_KEYS) {
    if (key in next) delete next[key]
  }
  return next
}

/**
 * Fetch the versions list. Prefer paged walk via fetchAllXanoPages; also accept a
 * bare array if an env override points at a non-paged endpoint.
 */
async function fetchUpstream(): Promise<any[]> {
  const { items, complete } = await fetchAllXanoPagesWithCompleteness(
    versionsUrl(),
    { include_schedules: false },
    "media_plan_versions_latest",
    PAGE_SIZE,
    50
  )
  if (!complete) {
    throw new Error(
      "media_plan_versions_latest page walk incomplete; refusing to cache partial data"
    )
  }
  const list = Array.isArray(items) ? items : parseXanoListPayload(items)
  return list.map(stripScheduleFields)
}

function startRefresh(): Promise<MediaPlanVersionsCacheResult> {
  const promise = (async (): Promise<MediaPlanVersionsCacheResult> => {
    try {
      const data = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[mediaPlanVersionsCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err,
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

/**
 * Returns the latest-per-MBA media_plan_versions list, coalescing concurrent
 * callers onto one upstream walk. Past-TTL hits return immediately and refresh
 * in the background. Serves last-known-good on failure (`stale: true`);
 * rejects only when there has never been a successful fetch.
 */
export async function getCachedMediaPlanVersions(): Promise<MediaPlanVersionsCacheResult> {
  const now = Date.now()

  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return { data: cacheEntry.data, stale: false }
  }

  // Populated but past TTL: serve immediately, revalidate in the background.
  if (cacheEntry) {
    if (!inFlightPromise) {
      void startRefresh()
    }
    return { data: cacheEntry.data, stale: false }
  }

  // Cold start — never filled; block until upstream succeeds or rejects.
  if (inFlightPromise) {
    return inFlightPromise
  }

  return startRefresh()
}
