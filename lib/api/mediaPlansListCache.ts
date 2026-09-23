import { getCachedMediaPlanVersions } from "@/lib/api/mediaPlanVersionsCache"
import { overlayMasterOwnedListFields } from "@/lib/api/overlayMasterOwnedListFields"
import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"
import {
  parseVersionNumber,
  publishedVersionFromMaster,
  pickPublishedVersionRow,
} from "@/lib/mediaplan/publishedVersionGuard"

/**
 * Coalesced TTL cache for the media plans list page
 * (`GET /api/mediaplans`): latest-per-MBA versions + masters, joined by mba_number.
 *
 * Versions come from `getCachedMediaPlanVersions` (shared `_latest` walk with the
 * dashboard) so a cold start hits `media_plan_versions_latest` once for both.
 * Masters overlay published `version_number` plus master-owned scalars that Xano
 * `_latest` carried inline (notably `mp_client_name`); Postgres version rows omit
 * those. Versions without a master row are kept.
 *
 * Master-owned overlay lives in `overlayMasterOwnedListFields.ts` â€” shared with
 * `mediaPlanVersionsCache` (dashboard `/api/media_plans`). Twin-file: change both.
 */

/** Re-export for list-cache consumers / tests (canonical: overlayMasterOwnedListFields.ts). */
export {
  MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS,
  overlayMasterOwnedListFields,
} from "@/lib/api/overlayMasterOwnedListFields"

const DEFAULT_TTL_MS = 60_000

const SCHEDULE_KEYS = [
  "deliverySchedule",
  "delivery_schedule",
  "billingSchedule",
  "billing_schedule",
] as const

export type MediaPlansListCacheResult = {
  data: any[]
  stale: boolean
  fetchedAt?: number
}

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

let cacheEntry: CacheEntry | null = null
let inFlightPromise: Promise<MediaPlansListCacheResult> | null = null

function cacheTtlMs(): number {
  const raw = process.env.MEDIA_PLANS_LIST_CACHE_TTL_MS
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

async function fetchVersionsForList(): Promise<{
  data: any[]
  stale: boolean
  fetchedAt?: number
}> {
  // Shared `_latest` walk (PAGE_SIZE=50, include_schedules=false). Schedules
  // are already stripped by mediaPlanVersionsCache.
  return getCachedMediaPlanVersions()
}

async function fetchMasters(): Promise<any[]> {
  const { readPlanMasters } = await import("@/lib/data/readMediaPlans")
  return readPlanMasters()
}

async function fetchPublishedVersionRow(
  mbaNumber: string,
  published: number,
): Promise<any | null> {
  try {
    const { readPlanVersionsByMba } = await import("@/lib/data/readMediaPlans")
    const rows = await readPlanVersionsByMba(mbaNumber)
    const match = pickPublishedVersionRow(rows, published)
    return match ? stripScheduleFields(match) : null
  } catch (err) {
    console.warn(
      `[mediaPlansListCache] failed to fetch published vn=${published} for mba=${mbaNumber}`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function mergeLatestVersionsWithMasters(
  versionsData: any[],
  mastersData: any[],
): Promise<any[]> {
  const masterMap = new Map<string, any>()
  for (const master of mastersData) {
    const key = mbaJoinKey(master?.mba_number)
    if (key) masterMap.set(key, master)
  }

  // Reduce to unique MBA: highest version_number, tie-break highest id.
  const latestByMba = new Map<string, any>()
  for (const plan of versionsData) {
    const key = mbaJoinKey(plan?.mba_number)
    if (!key) continue
    const existing = latestByMba.get(key)
    const planVersion = plan.version_number || 0
    const existingVersion = existing?.version_number || 0
    if (
      !existing ||
      existingVersion < planVersion ||
      (existingVersion === planVersion && (existing.id || 0) < (plan.id || 0))
    ) {
      latestByMba.set(key, plan)
    }
  }

  // Master overlay: published version_number watermark + master-owned scalars
  // (mp_client_name). If `_latest` is an unpublished staged row (vn > master),
  // resolve the published row instead of rewriting the number on staged content.
  const merged = await Promise.all(
    Array.from(latestByMba.values()).map(async (versionPlan) => {
      const masterData = masterMap.get(mbaJoinKey(versionPlan.mba_number) ?? "")
      if (!masterData || masterData.version_number === undefined) {
        return overlayMasterOwnedListFields(versionPlan, masterData)
      }
      const published = publishedVersionFromMaster(masterData)
      const planVn = parseVersionNumber(versionPlan.version_number)
      if (published > 0 && planVn > published) {
        const publishedRow = await fetchPublishedVersionRow(
          String(versionPlan.mba_number),
          published,
        )
        if (publishedRow) {
          return overlayMasterOwnedListFields(
            {
              ...publishedRow,
              version_number: masterData.version_number,
            },
            masterData,
          )
        }
        console.warn(
          `[mediaPlansListCache] omitting unpublished staged list row mba=${versionPlan.mba_number} vn=${planVn} published=${published}`,
        )
        return null
      }
      return overlayMasterOwnedListFields(
        {
          ...versionPlan,
          version_number: masterData.version_number,
        },
        masterData,
      )
    }),
  )
  return merged.filter((row): row is any => row != null)
}

async function fetchUpstream(): Promise<{ data: any[]; stale: boolean; fetchedAt?: number }> {
  // Sequential on purpose: two concurrent multi-page walks contend on the shared Xano instance and can push one past the 15s timeout.
  const versions = await fetchVersionsForList()
  const mastersData = await fetchMasters()
  const data = await mergeLatestVersionsWithMasters(versions.data, mastersData)
  return { data, stale: versions.stale, fetchedAt: versions.fetchedAt }
}

export async function getCachedMediaPlansList(): Promise<MediaPlansListCacheResult> {
  const now = Date.now()
  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return { data: cacheEntry.data, stale: false, fetchedAt: cacheEntry.fetchedAt }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  const promise = (async (): Promise<MediaPlansListCacheResult> => {
    try {
      const { data, stale, fetchedAt } = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return {
        data,
        stale,
        fetchedAt: fetchedAt ?? cacheEntry.fetchedAt,
      }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[mediaPlansListCache] upstream failed; serving last-known-good",
          err instanceof Error ? err.message : err
        )
        return { data: cacheEntry.data, stale: true, fetchedAt: cacheEntry.fetchedAt }
      }
      throw err
    } finally {
      inFlightPromise = null
    }
  })()

  inFlightPromise = promise
  return promise
}

/** Fallback path used when the primary list cache fetch fails entirely. Postgres only. */
export async function fetchMediaPlansListFallback(): Promise<any[]> {
  const [masters, versions] = await Promise.all([
    fetchMasters(),
    getCachedMediaPlanVersions(),
  ])
  return mergeLatestVersionsWithMasters(versions.data, masters)
}

