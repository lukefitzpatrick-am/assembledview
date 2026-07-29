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
 * Past-TTL hits await a refresh (upstream is ~400ms post-upgrade). Fire-and-forget
 * background refresh was suspended by the serverless runtime and produced phantom
 * 15s timeouts while serving a frozen last-known-good as if it were fresh.
 *
 * Consumers of this cache must treat the value as a latest-version-per-MBA list
 * of scalar fields only. Call sites that need schedules or version history must
 * hit `media_plan_versions` (paged) directly — never this cache.
 */

const DEFAULT_TTL_MS = 60_000
/** Halved from 100: page 1 at per_page=50 measured ~429ms vs ~844ms at 100 (29 Jul 2026). */
const PAGE_SIZE = 50
const FAILURE_BACKOFF_MS = 30_000

const SCHEDULE_KEYS = [
  "deliverySchedule",
  "delivery_schedule",
  "billingSchedule",
  "billing_schedule",
] as const

export type MediaPlanVersionsCacheResult = {
  data: any[]
  stale: boolean
  /** Epoch ms of the last successful upstream fill (undefined if never filled). */
  fetchedAt?: number
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<MediaPlanVersionsCacheResult> | null = null
/** Set when a refresh fails; cleared on success. Gates retry hammering. */
let lastRefreshFailedAt: number | null = null

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
      lastRefreshFailedAt = null
      return { data, stale: false, fetchedAt: cacheEntry.fetchedAt }
    } catch (err) {
      lastRefreshFailedAt = Date.now()
      if (cacheEntry) {
        console.warn(
          "[mediaPlanVersionsCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err,
        )
        return {
          data: cacheEntry.data,
          stale: true,
          fetchedAt: cacheEntry.fetchedAt,
        }
      }
      throw err
    } finally {
      inFlightPromise = null
    }
  })()

  inFlightPromise = promise
  return promise
}

function serveCached(stale: boolean): MediaPlanVersionsCacheResult {
  return {
    data: cacheEntry!.data,
    stale,
    fetchedAt: cacheEntry!.fetchedAt,
  }
}

/**
 * Returns the latest-per-MBA media_plan_versions list, coalescing concurrent
 * callers onto one upstream walk. Past-TTL hits await a refresh (safe in both
 * request scope and instrumentation boot). Serves last-known-good on failure
 * (`stale: true`); rejects only when there has never been a successful fetch.
 */
export async function getCachedMediaPlanVersions(): Promise<MediaPlanVersionsCacheResult> {
  const now = Date.now()
  const ttl = cacheTtlMs()
  const fresh =
    cacheEntry != null &&
    now - cacheEntry.fetchedAt < ttl &&
    lastRefreshFailedAt == null

  if (fresh) {
    return serveCached(false)
  }

  // Failure backoff: do not kick another doomed upstream call for 30s.
  if (
    cacheEntry &&
    lastRefreshFailedAt != null &&
    now - lastRefreshFailedAt < FAILURE_BACKOFF_MS
  ) {
    return serveCached(true)
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  // Past TTL (or cold): await refresh. Prefer await over after()/waitUntil so
  // boot-time instrumentation and request paths share one safe code path, and
  // so Vercel cannot suspend mid-refresh after the response is sent.
  return startRefresh()
}
