/**
 * Home `/dashboard` table filters and KPI counts.
 * KPI tiles must use the same filtered row sets as the Live Campaigns / Live Scopes panels.
 */

import { matchText, normalizeSearchText } from "@/lib/search/matchText"

export type DashboardViewFilters = {
  campaignSearch: string
  /** Normalized client keys (same values as the client multi-select). */
  clients: string[]
  /** Publisher names retained for URL/saved-view compatibility (schedule filtering removed). */
  publishers: string[]
  /** Month label retained for URL/saved-view compatibility (schedule filtering removed). */
  month: string | null
}

export type DashboardPlanFilterRow = {
  mp_clientname?: string | null
  mp_campaignname?: string | null
  mp_mba_number?: string | null
  mp_brand?: string | null
  mp_campaignstatus?: string | null
}

export type DashboardScopeFilterRow = {
  client_name?: string | null
  project_name?: string | null
  project_status?: string | null
  project_overview?: string | null
}

export const defaultDashboardViewFilters = (): DashboardViewFilters => ({
  campaignSearch: "",
  clients: [],
  publishers: [],
  month: null,
})

export const normalizeDashboardSearch = (value: string) => normalizeSearchText(value)

export const normalizeClientFilterValue = (value: string) => normalizeSearchText(value)

/** Live scopes: Approved / In-Progress, tolerant of case, hyphen/space, and trim. */
export function isLiveScopeStatus(status?: string | null): boolean {
  const normalized = (status || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "-")
  return normalized === "approved" || normalized === "in-progress"
}

export function applyDashboardTableFiltersToPlans<T extends DashboardPlanFilterRow>(
  plans: T[],
  filters: DashboardViewFilters,
): T[] {
  const searchQ = String(filters.campaignSearch ?? "").trim()
  const selectedClients = new Set(filters.clients.map((value) => normalizeClientFilterValue(value)).filter(Boolean))

  return plans.filter((plan) => {
    const clientKey = normalizeClientFilterValue(plan.mp_clientname || "")
    if (selectedClients.size > 0 && !selectedClients.has(clientKey)) return false

    if (searchQ) {
      const haystack = [
        plan.mp_clientname,
        plan.mp_campaignname,
        plan.mp_mba_number,
        plan.mp_brand,
        plan.mp_campaignstatus,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
      if (!matchText(haystack, searchQ)) return false
    }

    return true
  })
}

export function applyDashboardTableFiltersToScopes<T extends DashboardScopeFilterRow>(
  scopes: T[],
  filters: DashboardViewFilters,
): T[] {
  const searchQ = String(filters.campaignSearch ?? "").trim()
  const selectedClients = new Set(filters.clients.map((value) => normalizeClientFilterValue(value)).filter(Boolean))

  return scopes.filter((scope) => {
    const clientKey = normalizeClientFilterValue(scope.client_name || "")
    if (selectedClients.size > 0 && !selectedClients.has(clientKey)) return false

    if (searchQ) {
      const haystack = [
        scope.client_name,
        scope.project_name,
        scope.project_status,
        scope.project_overview,
      ]
        .map((x) => String(x ?? ""))
        .join(" ")
      if (!matchText(haystack, searchQ)) return false
    }

    return true
  })
}

export type HomeLiveKpiCounts = {
  liveCampaigns: number
  liveScopes: number
  liveClients: number
}

/** Same unique-client union the Home KPI tiles historically used — from the filtered live sets. */
export function computeHomeLiveKpiCounts(
  liveCampaigns: Array<{ mp_clientname?: string | null }>,
  liveScopes: Array<{ client_name?: string | null }>,
): HomeLiveKpiCounts {
  const liveClients = new Set<string>()
  for (const campaign of liveCampaigns) {
    if (campaign.mp_clientname) {
      const key = normalizeClientFilterValue(campaign.mp_clientname)
      if (key) liveClients.add(key)
    }
  }
  for (const scope of liveScopes) {
    if (scope.client_name) {
      const key = normalizeClientFilterValue(scope.client_name)
      if (key) liveClients.add(key)
    }
  }
  return {
    liveCampaigns: liveCampaigns.length,
    liveScopes: liveScopes.length,
    liveClients: liveClients.size,
  }
}

export type HomeMediaSpendFetchStatus = "loading" | "ready" | "error"

export type HomeMediaSpendTile = {
  /** False on fetch error — omit the tile rather than show a wrong number. */
  show: boolean
  /** Null while loading so the UI never paints a money zero as a placeholder. */
  amount: number | null
}

/**
 * Sum planned-to-date dollars for the filtered live-campaign set.
 * Missing map keys contribute 0. No clamp, filter, or pro-rata — the endpoint
 * already clamped to the FY and the array is already filtered.
 */
export function sumPlannedToDateForCampaigns(
  campaigns: Array<{ mp_mba_number?: string | null }>,
  byMba: Record<string, number>,
): number {
  let total = 0
  for (const campaign of campaigns) {
    const key = String(campaign.mp_mba_number ?? "").trim()
    if (!key) continue
    const amount = byMba[key]
    total += typeof amount === "number" && Number.isFinite(amount) ? amount : 0
  }
  return total
}

/** Home "Media Spend to Date" tile: loading shows a skeleton, error omits the tile. */
export function homeMediaSpendTile(
  status: HomeMediaSpendFetchStatus,
  campaigns: Array<{ mp_mba_number?: string | null }>,
  byMba: Record<string, number> | null,
): HomeMediaSpendTile {
  if (status === "loading") return { show: true, amount: null }
  if (status === "error" || !byMba) return { show: false, amount: null }
  return { show: true, amount: sumPlannedToDateForCampaigns(campaigns, byMba) }
}

/** Scope line under "Key metrics": All clients vs active filter summary. */
export function describeHomeMetricsFilterScope(filters: DashboardViewFilters): string {
  const search = filters.campaignSearch.trim()
  const clientCount = filters.clients.length
  if (clientCount === 0 && !search) return "All clients"

  const parts: string[] = []
  if (clientCount > 0) {
    parts.push(`${clientCount} client${clientCount === 1 ? "" : "s"}`)
  }
  if (search) {
    parts.push(`search "${search}"`)
  }
  return `Filtered: ${parts.join(" / ")}`
}
