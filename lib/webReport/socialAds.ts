import type { DateWindow } from "@/lib/webReport/periods"
import { field, num, text } from "@/lib/webReport/rows"
import type { SocialAdsCampaignRow, SocialAdsSlice, SocialAdsTotals, WarehouseQuery } from "@/lib/webReport/types"

/**
 * Paid social on the web report (REP-6, Luke 28 Oct 2026): every platform in
 * SOCIAL_PACING_FACT (Meta, TikTok, Reddit today), with a platform filter.
 * Spend is platform spend; AV's single "Paid media" total already includes it.
 */
export const SOCIAL_ADS_PLATFORMS = ["all", "meta", "tiktok", "reddit"] as const

export type SocialAdsPlatform = (typeof SOCIAL_ADS_PLATFORMS)[number]

export const SOCIAL_ADS_METRICS = ["spend", "impressions", "clicks"] as const

export type SocialAdsMetric = (typeof SOCIAL_ADS_METRICS)[number]

export const SOCIAL_PLATFORM_LABEL: Record<SocialAdsPlatform, string> = {
  all: "Paid social",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  reddit: "Reddit Ads",
}

function totals(row: Record<string, unknown>, prefix: "cur" | "prev"): SocialAdsTotals {
  return {
    impressions: num(field(row, `${prefix}_impressions`)) ?? 0,
    clicks: num(field(row, `${prefix}_clicks`)) ?? 0,
    spend: num(field(row, `${prefix}_spend`)) ?? 0,
  }
}

/** One row per campaign and channel from the social reader. */
export function socialAdsRowsFromWarehouse(rows: Record<string, unknown>[]): SocialAdsCampaignRow[] {
  return rows.map((row) => ({
    campaign: text(field(row, "campaign_name")) ?? "(not set)",
    channel: text(field(row, "channel")) ?? "(not set)",
    current: totals(row, "cur"),
    previous: totals(row, "prev"),
  }))
}

/** SOCIAL_PACING_FACT channel ("Social - Meta") to a platform. Anything else counts under All only. */
export function socialPlatformOf(channel: string): SocialAdsPlatform | null {
  const value = channel.toLowerCase()
  if (value.includes("meta") || value.includes("facebook") || value.includes("instagram")) return "meta"
  if (value.includes("tiktok")) return "tiktok"
  if (value.includes("reddit")) return "reddit"
  return null
}

/** Platform filter, then a case-insensitive "contains" on the campaign name. Blank keeps every campaign. */
export function filterSocialAdsRows(
  rows: readonly SocialAdsCampaignRow[],
  filter: { platform: SocialAdsPlatform; campaignContains?: string },
): SocialAdsCampaignRow[] {
  const needle = filter.campaignContains?.trim().toLowerCase() ?? ""
  return rows.filter((row) => {
    if (filter.platform !== "all" && socialPlatformOf(row.channel) !== filter.platform) return false
    if (needle && !row.campaign.toLowerCase().includes(needle)) return false
    return true
  })
}

export function sumSocialAds(rows: readonly SocialAdsCampaignRow[]): { current: SocialAdsTotals; previous: SocialAdsTotals } {
  const zero = (): SocialAdsTotals => ({ impressions: 0, clicks: 0, spend: 0 })
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

/** Same id cap as the social pacing read. */
const MAX_IDS = 500

/**
 * Spend, impressions and clicks by campaign and channel from
 * SOCIAL_PACING_FACT, for the client's social line items only. Ids come from
 * the client's own media plan snapshots (readAvPaid), so the read is scoped
 * the same way as AV spend. Rows match on LOWER(LINE_ITEM_ID), like the social
 * pacing read.
 */
export function socialAdsSql(idCount: number): string {
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
FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
WHERE LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) IN (${placeholders})
  AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
GROUP BY CAMPAIGN_NAME, CHANNEL
`
}

export function socialAdsBinds(ids: string[], current: DateWindow, previous: DateWindow): unknown[] {
  const cur = [current.from, current.to]
  const prev = [previous.from, previous.to]
  const from = current.from < previous.from ? current.from : previous.from
  const to = current.to > previous.to ? current.to : previous.to
  return [...cur, ...cur, ...cur, ...prev, ...prev, ...prev, ...ids, from, to]
}

export async function readSocialAdsWith(input: {
  lineItemIds: ReadonlySet<string>
  current: DateWindow
  previous: DateWindow
  query: WarehouseQuery
}): Promise<SocialAdsSlice> {
  const ids = [...input.lineItemIds].sort().slice(0, MAX_IDS)
  if (ids.length === 0) {
    return { status: "empty", message: "No social line items on this client's media plans", campaigns: [] }
  }
  try {
    const rows = await input.query(socialAdsSql(ids.length), socialAdsBinds(ids, input.current, input.previous))
    const campaigns = socialAdsRowsFromWarehouse(rows)
    return { status: campaigns.length > 0 ? "ok" : "empty", message: null, campaigns }
  } catch (err) {
    console.error("[web-report] paid social read failed", err)
    return { status: "error", message: "Paid social could not be read", campaigns: [] }
  }
}
