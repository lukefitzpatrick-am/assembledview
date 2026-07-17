import axios from "axios"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import {
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoPostHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import { getCachedMediaPlanVersions } from "@/lib/api/mediaPlanVersionsCache"

/**
 * Coalesced TTL cache for the media plans list page
 * (`GET /api/mediaplans`): latest-per-MBA versions + masters, joined by mba_number.
 *
 * Versions come from `getCachedMediaPlanVersions` (shared `_latest` walk with the
 * dashboard) so a cold start hits `media_plan_versions_latest` once for both.
 * Masters overlay `version_number` only; versions without a master row are kept.
 */

const DEFAULT_TTL_MS = 60_000
const PAGE_SIZE = 100

const SCHEDULE_KEYS = [
  "deliverySchedule",
  "delivery_schedule",
  "billingSchedule",
  "billing_schedule",
] as const

export type MediaPlansListCacheResult = {
  data: any[]
  stale: boolean
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

function mediaPlansUrl(path: string): string {
  return xanoUrl(path, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
}

async function fetchVersionsForList(): Promise<any[]> {
  // Shared `_latest` walk (PAGE_SIZE=100, include_schedules=false). Schedules
  // are already stripped by mediaPlanVersionsCache.
  const { data } = await getCachedMediaPlanVersions()
  return data
}

async function fetchMasters(): Promise<any[]> {
  const { items, complete } = await fetchAllXanoPagesWithCompleteness(
    mediaPlansUrl("media_plan_master"),
    {},
    "MEDIAPLANS_master",
    PAGE_SIZE,
    50
  )
  if (!complete) {
    throw new Error("media_plan_master page walk incomplete")
  }
  return items
}

function mergeLatestVersionsWithMasters(versionsData: any[], mastersData: any[]): any[] {
  const masterMap = new Map<string, any>()
  for (const master of mastersData) {
    if (master?.mba_number) {
      masterMap.set(master.mba_number, master)
    }
  }

  // Reduce to unique MBA: highest version_number, tie-break highest id.
  const latestByMba = new Map<string, any>()
  for (const plan of versionsData) {
    const mbaNumber = plan?.mba_number
    if (!mbaNumber) continue
    const existing = latestByMba.get(mbaNumber)
    const planVersion = plan.version_number || 0
    const existingVersion = existing?.version_number || 0
    if (
      !existing ||
      existingVersion < planVersion ||
      (existingVersion === planVersion && (existing.id || 0) < (plan.id || 0))
    ) {
      latestByMba.set(mbaNumber, plan)
    }
  }

  // Master overlay: version_number only. Missing masters are tolerated (kept as-is).
  return Array.from(latestByMba.values()).map((versionPlan) => {
    const masterData = masterMap.get(versionPlan.mba_number)
    if (masterData && masterData.version_number !== undefined) {
      return {
        ...versionPlan,
        version_number: masterData.version_number,
      }
    }
    return versionPlan
  })
}

async function fetchUpstream(): Promise<any[]> {
  // Sequential on purpose: two concurrent multi-page walks contend on the shared Xano Launch instance and can push one past the 15s timeout.
  const versionsData = await fetchVersionsForList()
  const mastersData = await fetchMasters()
  return mergeLatestVersionsWithMasters(versionsData, mastersData)
}

export async function getCachedMediaPlansList(): Promise<MediaPlansListCacheResult> {
  const now = Date.now()
  if (cacheEntry && now - cacheEntry.fetchedAt < cacheTtlMs()) {
    return { data: cacheEntry.data, stale: false }
  }

  if (inFlightPromise) {
    return inFlightPromise
  }

  const promise = (async (): Promise<MediaPlansListCacheResult> => {
    try {
      const data = await fetchUpstream()
      cacheEntry = { data, fetchedAt: Date.now() }
      return { data, stale: false }
    } catch (err) {
      if (cacheEntry) {
        console.warn(
          "[mediaPlansListCache] upstream failed; serving last-known-good",
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

/** Fallback path used when the primary list cache fetch fails entirely. */
export async function fetchMediaPlansListFallback(): Promise<any[]> {
  const XANO_TIMEOUT_MS = 15_000
  const XANO_LONG_TIMEOUT_MS = 30_000

  let masterMap = new Map<string, any>()
  try {
    const masters = await fetchMasters()
    for (const master of masters) {
      if (master?.mba_number) masterMap.set(master.mba_number, master)
    }
  } catch (masterError) {
    console.log("Could not fetch masters for version number:", masterError)
    try {
      // REVIEW: Server-only cache module (used from API routes); auth via choke point.
      const masterResponse = await axios.get(mediaPlansUrl("media_plan_master"), {
        timeout: XANO_TIMEOUT_MS,
        headers: xanoAuthHeaderRecord(),
      })
      const masters = parseXanoListPayload(masterResponse.data)
      for (const master of masters) {
        if (master?.mba_number) masterMap.set(master.mba_number, master)
      }
    } catch {
      // ignore
    }
  }

  let latestVersionId = 1
  if (masterMap.size > 0) {
    latestVersionId = Math.max(
      ...Array.from(masterMap.values()).map((m: any) => m.version_number || 1)
    )
  }

  const originalResponse = await axios.post(
    xanoUrl("get_mediaplan_topline", "XANO_MEDIAPLANS_BASE_URL"),
    { version_number: latestVersionId },
    { timeout: XANO_LONG_TIMEOUT_MS, headers: xanoPostHeaderRecord() }
  )

  const fallbackData = Array.isArray(originalResponse.data)
    ? originalResponse.data
    : [originalResponse.data]

  const latestByMba = new Map<string, any>()
  for (const plan of fallbackData) {
    const mbaNumber = plan?.mba_number
    if (!mbaNumber) continue
    const existing = latestByMba.get(mbaNumber)
    const planVersion = plan.version_number || 0
    const existingVersion = existing?.version_number || 0
    if (
      !existing ||
      existingVersion < planVersion ||
      (existingVersion === planVersion && (existing.id || 0) < (plan.id || 0))
    ) {
      latestByMba.set(mbaNumber, stripScheduleFields(plan))
    }
  }

  return Array.from(latestByMba.values()).map((plan) => {
    const masterData = masterMap.get(plan.mba_number)
    if (masterData && masterData.version_number !== undefined) {
      return { ...plan, version_number: masterData.version_number }
    }
    return plan
  })
}
