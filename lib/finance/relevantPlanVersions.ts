import axios from "axios"
import { campaignOverlapsMonth } from "@/lib/finance/utils"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"

export type RelevantVersionsResult = {
  year: number
  month: number
  allVersions: any[]
  relevantVersions: any[]
}

export type MbaVersionInfo = { masterId?: number; versionNumber: number }

const CACHE_TTL_MS = 30_000

const relevantPlanVersionsCache = new Map<
  string,
  { expiresAt: number; value: RelevantVersionsResult }
>()
const relevantPlanVersionsInFlight = new Map<
  string,
  Promise<RelevantVersionsResult | { error: string; status: number }>
>()

export function clearRelevantPlanVersionsCache(): void {
  relevantPlanVersionsCache.clear()
  relevantPlanVersionsInFlight.clear()
}

/**
 * Latest published version per MBA from `media_plan_master` rows.
 * Trust master.version_number only — never raise the map from version rows.
 * Staged-but-unpublished rows (vn > master) must not become "relevant".
 */
export function buildMbaToLatestVersionMap(masters: any[]): Map<string, MbaVersionInfo> {
  const mbaToVersionMap = new Map<string, MbaVersionInfo>()
  masters.forEach((master: any) => {
    if (master.mba_number && master.version_number) {
      const versionNumber = Number(master.version_number) || 0
      const existing = mbaToVersionMap.get(master.mba_number)
      if (!existing || versionNumber > existing.versionNumber) {
        mbaToVersionMap.set(master.mba_number, {
          masterId: master.id,
          versionNumber,
        })
      }
    }
  })
  return mbaToVersionMap
}

/**
 * Month-scoped relevance filter shared by the single-month and multi-month fetch
 * paths. Each month MUST see exactly the version set it would have seen from a
 * single-month fetch — this is the single source of truth for that predicate.
 */
export function selectRelevantVersionsForMonth(
  allVersions: any[],
  mbaToVersionMap: Map<string, MbaVersionInfo>,
  year: number,
  month: number
): any[] {
  return allVersions.filter((version: any) => {
    if (!version.mba_number) return false
    const versionInfo = mbaToVersionMap.get(version.mba_number)
    if (!versionInfo) return false

    const isLatestVersionNumber = Number(version.version_number) === Number(versionInfo.versionNumber)
    const masterIdMatches =
      !version.media_plan_master_id ||
      !versionInfo.masterId ||
      version.media_plan_master_id === versionInfo.masterId

    if (!isLatestVersionNumber || !masterIdMatches) return false

    if (version.campaign_start_date && version.campaign_end_date) {
      return campaignOverlapsMonth(version.campaign_start_date, version.campaign_end_date, year, month)
    }
    return false
  })
}

async function fetchMastersAndAllVersions(): Promise<{ masters: any[]; allVersions: any[] }> {
  const mastersResponse = await axios.get(
    xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
    { headers: xanoAuthHeaderRecord() },
  )
  const masters = Array.isArray(mastersResponse.data) ? mastersResponse.data : []

  // Full version history (paged) — do NOT use media_plan_versions_latest / dashboard cache.
  const allVersions = await fetchAllXanoPages(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
    {},
    "FINANCE_relevant_plan_versions",
    100,
    50
  )

  return { masters, allVersions }
}

function parseMonthParam(monthParam: string): { year: number; month: number } | null {
  const [year, month] = monthParam.split("-").map(Number)
  if (!year || !month || month < 1 || month > 12) return null
  return { year, month }
}

/**
 * Latest media plan versions whose campaign dates overlap the given calendar month.
 * Shared by finance API routes (media billing, publisher invoices, etc.).
 */
export async function fetchRelevantPlanVersionsForFinanceMonth(
  monthParam: string
): Promise<RelevantVersionsResult | { error: string; status: number }> {
  const parsed = parseMonthParam(monthParam)
  if (!parsed) {
    return { error: "Invalid month format. Use YYYY-MM", status: 400 }
  }
  const { year, month } = parsed

  const now = Date.now()
  const cached = relevantPlanVersionsCache.get(monthParam)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const inflight = relevantPlanVersionsInFlight.get(monthParam)
  if (inflight) {
    return inflight
  }

  const promise = (async (): Promise<RelevantVersionsResult> => {
    try {
      const { masters, allVersions } = await fetchMastersAndAllVersions()
      const mbaToVersionMap = buildMbaToLatestVersionMap(masters)
      const relevantVersions = selectRelevantVersionsForMonth(allVersions, mbaToVersionMap, year, month)

      const value: RelevantVersionsResult = { year, month, allVersions, relevantVersions }
      relevantPlanVersionsCache.set(monthParam, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      })
      return value
    } finally {
      relevantPlanVersionsInFlight.delete(monthParam)
    }
  })()

  relevantPlanVersionsInFlight.set(monthParam, promise)
  return promise
}

/**
 * Multi-month variant: fetches the master + full-version superset ONCE, then
 * derives each month's relevant set with {@link selectRelevantVersionsForMonth}
 * — the exact predicate the single-month path uses — so no month sees a wider
 * or narrower version set than a single-month fetch would have produced.
 *
 * Seeds the per-month cache so subsequent single-month requests reuse the work.
 */
export async function fetchRelevantPlanVersionsForFinanceMonths(
  monthParams: string[]
): Promise<Map<string, RelevantVersionsResult> | { error: string; status: number }> {
  const parsedMonths: Array<{ monthParam: string; year: number; month: number }> = []
  for (const monthParam of monthParams) {
    const parsed = parseMonthParam(monthParam)
    if (!parsed) {
      return { error: `Invalid month format: ${monthParam}. Use YYYY-MM`, status: 400 }
    }
    parsedMonths.push({ monthParam, ...parsed })
  }

  const now = Date.now()
  const out = new Map<string, RelevantVersionsResult>()
  let allCached = true
  for (const { monthParam } of parsedMonths) {
    const cached = relevantPlanVersionsCache.get(monthParam)
    if (cached && cached.expiresAt > now) {
      out.set(monthParam, cached.value)
    } else {
      allCached = false
      break
    }
  }
  if (allCached && out.size === parsedMonths.length) {
    return out
  }
  out.clear()

  const { masters, allVersions } = await fetchMastersAndAllVersions()
  const mbaToVersionMap = buildMbaToLatestVersionMap(masters)
  const expiresAt = Date.now() + CACHE_TTL_MS
  for (const { monthParam, year, month } of parsedMonths) {
    const relevantVersions = selectRelevantVersionsForMonth(allVersions, mbaToVersionMap, year, month)
    const value: RelevantVersionsResult = { year, month, allVersions, relevantVersions }
    out.set(monthParam, value)
    relevantPlanVersionsCache.set(monthParam, { expiresAt, value })
  }
  return out
}
