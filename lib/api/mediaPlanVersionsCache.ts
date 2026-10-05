import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"

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
const FAILURE_BACKOFF_MS = 30_000

const SCHEDULE_KEYS = [
  "deliverySchedule",
  "delivery_schedule",
  "billingSchedule",
  "billing_schedule",
] as const

export type MediaPlanVersionsCacheResult = {
  data: any[]
  /** Masters loaded with this fill. List cache reuses them instead of a second read. */
  masters: any[]
  stale: boolean
  /** Epoch ms of the last successful upstream fill (undefined if never filled). */
  fetchedAt?: number
}

type CacheEntry = {
  data: any[]
  masters: any[]
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
 * Honors DATA_BACKEND_PLANS: postgres rebuilds latest-per-MBA from consolidated versions
 * and overlays master-owned scalars (`mp_client_name`) — Xano `_latest` had these
 * inline; Postgres versions do not (DI-9b; twin of mediaPlansListCache / DI-9).
 */
async function fetchUpstream(): Promise<{ data: any[]; masters: any[] }> {
  const { readPlanVersionsWithoutSchedules, readPlanMasters } = await import(
    "@/lib/data/readMediaPlans"
  )
  const { applyMasterOwnedOverlayByMba } = await import(
    "@/lib/api/overlayMasterOwnedListFields"
  )
  const [all, masters] = await Promise.all([
    readPlanVersionsWithoutSchedules(),
    readPlanMasters(),
  ])
  const latestByMba = new Map<string, any>()
  for (const plan of all) {
    const key = mbaJoinKey(plan?.mba_number)
    if (!key) continue
    const existing = latestByMba.get(key)
    const planVn = Number(plan.version_number) || 0
    const existingVn = Number(existing?.version_number) || 0
    if (
      !existing ||
      existingVn < planVn ||
      (existingVn === planVn && Number(existing?.id || 0) < Number(plan.id || 0))
    ) {
      latestByMba.set(key, plan)
    }
  }
  const latest = Array.from(latestByMba.values()).map(stripScheduleFields)
  return {
    data: applyMasterOwnedOverlayByMba(latest, masters),
    masters,
  }
}

function startRefresh(): Promise<MediaPlanVersionsCacheResult> {
  const promise = (async (): Promise<MediaPlanVersionsCacheResult> => {
    try {
      const filled = await fetchUpstream()
      cacheEntry = {
        data: filled.data,
        masters: filled.masters,
        fetchedAt: Date.now(),
      }
      lastRefreshFailedAt = null
      return {
        data: filled.data,
        masters: filled.masters,
        stale: false,
        fetchedAt: cacheEntry.fetchedAt,
      }
    } catch (err) {
      lastRefreshFailedAt = Date.now()
      if (cacheEntry) {
        console.warn(
          "[mediaPlanVersionsCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err,
        )
        return {
          data: cacheEntry.data,
          masters: cacheEntry.masters,
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
    masters: cacheEntry!.masters,
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
