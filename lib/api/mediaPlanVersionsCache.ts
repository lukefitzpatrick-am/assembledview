import "server-only"

import { unstable_cache } from "next/cache"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

/**
 * Durable shared cache for the dashboard's latest media_plan_versions list.
 *
 * Default upstream: `media_plan_versions_latest` (one row per mba_number, highest
 * version_number), paged, with `include_schedules=false`. Schedule JSON is also
 * stripped after fetch so dashboard/list payloads stay small even if Xano ignores
 * the flag.
 *
 * Auth stays outside this cache. Serves last-known-good on upstream failure
 * (`stale: true`).
 *
 * Consumers of this cache must treat the value as a latest-version-per-MBA list
 * of scalar fields only. Call sites that need schedules or version history must
 * hit `media_plan_versions` (paged) directly — never this cache.
 */

export const MEDIA_PLAN_VERSIONS_TAG = "media-plan-versions"
const REVALIDATE_SECONDS = 60
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

/** Process-local LKG for stale-on-failure within a warm instance. */
let lastKnownGood: any[] | null = null

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

/**
 * Returns the latest-per-MBA media_plan_versions list from the durable Data Cache.
 * Serves last-known-good on failure (`stale: true`); rejects only when there
 * has never been a successful fetch on this instance and Data Cache misses.
 */
export async function getCachedMediaPlanVersions(): Promise<MediaPlanVersionsCacheResult> {
  try {
    const cached = unstable_cache(
      async () => fetchUpstream(),
      ["media-plan-versions"],
      { revalidate: REVALIDATE_SECONDS, tags: [MEDIA_PLAN_VERSIONS_TAG] }
    )
    const data = await cached()
    lastKnownGood = data
    return { data, stale: false }
  } catch (err) {
    if (lastKnownGood) {
      console.warn(
        "[mediaPlanVersionsCache] upstream failed; serving last-known-good",
        err instanceof Error ? err.message : err,
      )
      return { data: lastKnownGood, stale: true }
    }
    throw err
  }
}
