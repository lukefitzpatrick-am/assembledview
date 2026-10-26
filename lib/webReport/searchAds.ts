import type { DateWindow } from "@/lib/webReport/periods"
import { field, num, text } from "@/lib/webReport/rows"
import type { SearchAdsCampaignRow, SearchAdsSlice, SearchAdsTotals, WarehouseQuery } from "@/lib/webReport/types"

export const SEARCH_ADS_PLATFORMS = ["google", "all"] as const

export type SearchAdsPlatform = (typeof SEARCH_ADS_PLATFORMS)[number]

export const SEARCH_ADS_METRICS = ["impressions", "clicks", "spend"] as const

export type SearchAdsMetric = (typeof SEARCH_ADS_METRICS)[number]

function totals(row: Record<string, unknown>, prefix: "cur" | "prev"): SearchAdsTotals {
  return {
    impressions: num(field(row, `${prefix}_impressions`)) ?? 0,
    clicks: num(field(row, `${prefix}_clicks`)) ?? 0,
    spend: num(field(row, `${prefix}_spend`)) ?? 0,
  }
}

/** One row per campaign and channel from the search reader. */
export function searchAdsRowsFromWarehouse(rows: Record<string, unknown>[]): SearchAdsCampaignRow[] {
  return rows.map((row) => ({
    campaign: text(field(row, "campaign_name")) ?? "(not set)",
    channel: text(field(row, "channel")) ?? "(not set)",
    current: totals(row, "cur"),
    previous: totals(row, "prev"),
  }))
}

/** Google Ads keeps channels named "... - Google Ads" (Search and PMax). Microsoft Ads is left out. */
export function isGoogleAdsChannel(channel: string): boolean {
  return /google ads/i.test(channel)
}

/** Case-insensitive "contains" on the Google Ads campaign name. Blank keeps every campaign. */
export function filterSearchAdsRows(
  rows: readonly SearchAdsCampaignRow[],
  filter: { platform: SearchAdsPlatform; campaignContains?: string },
): SearchAdsCampaignRow[] {
  const needle = filter.campaignContains?.trim().toLowerCase() ?? ""
  return rows.filter((row) => {
    if (filter.platform === "google" && !isGoogleAdsChannel(row.channel)) return false
    if (needle && !row.campaign.toLowerCase().includes(needle)) return false
    return true
  })
}

export function sumSearchAds(rows: readonly SearchAdsCampaignRow[]): { current: SearchAdsTotals; previous: SearchAdsTotals } {
  const zero = (): SearchAdsTotals => ({ impressions: 0, clicks: 0, spend: 0 })
  const current = zero()
  const previous = zero()
  for (const row of rows) {
    current.impressions += row.current.impressions
    current.clicks += row.current.clicks
    current.spend += row.current.spend
    previous.impressions += row.previous.impressions
    previous.clicks += row.previous.clicks
    previous.spend += row.previous.spend
  }
  return { current, previous }
}

/** Same id cap as getSearchPacingData. */
const MAX_IDS = 500

/**
 * Impressions, clicks and spend by campaign from SEARCH_PACING_FACT, for the
 * client's search line items only. Ids come from the client's own media plan
 * snapshots (readAvPaid), so the read is scoped the same way as AV spend. Rows
 * match on LINE_ITEM_ID or LINE_ITEM_NAME, like getSearchPacingData.
 */
export function searchAdsSql(idCount: number): string {
  const placeholders = Array.from({ length: idCount }, () => "?").join(", ")
  return `
SELECT CAMPAIGN_NAME AS campaign_name,
  CHANNEL AS channel,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), IMPRESSIONS, 0)) AS cur_impressions,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), CLICKS, 0)) AS cur_clicks,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), AMOUNT_SPENT, 0)) AS cur_spend,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), IMPRESSIONS, 0)) AS prev_impressions,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), CLICKS, 0)) AS prev_clicks,
  SUM(IFF(CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?), AMOUNT_SPENT, 0)) AS prev_spend
FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
WHERE (
    LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) IN (${placeholders})
    OR LOWER(TRIM(COALESCE(LINE_ITEM_NAME, ''))) IN (${placeholders})
  )
  AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
GROUP BY CAMPAIGN_NAME, CHANNEL
`
}

export function searchAdsBinds(ids: string[], current: DateWindow, previous: DateWindow): unknown[] {
  const cur = [current.from, current.to]
  const prev = [previous.from, previous.to]
  const from = current.from < previous.from ? current.from : previous.from
  const to = current.to > previous.to ? current.to : previous.to
  return [...cur, ...cur, ...cur, ...prev, ...prev, ...prev, ...ids, ...ids, from, to]
}

export async function readSearchAdsWith(input: {
  lineItemIds: ReadonlySet<string>
  current: DateWindow
  previous: DateWindow
  query: WarehouseQuery
}): Promise<SearchAdsSlice> {
  const ids = [...input.lineItemIds].sort().slice(0, MAX_IDS)
  if (ids.length === 0) {
    return { status: "empty", message: "No search line items on this client's media plans", campaigns: [] }
  }
  const query = input.query
  try {
    const rows = await query(searchAdsSql(ids.length), searchAdsBinds(ids, input.current, input.previous))
    const campaigns = searchAdsRowsFromWarehouse(rows)
    return { status: campaigns.length > 0 ? "ok" : "empty", message: null, campaigns }
  } catch (err) {
    console.error("[web-report] paid search read failed", err)
    return { status: "error", message: "Paid search could not be read", campaigns: [] }
  }
}
