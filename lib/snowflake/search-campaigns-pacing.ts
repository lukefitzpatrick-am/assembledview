import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"

/** One ad-group-day row from SEARCH_PACING_FACT at ad-group grain. */
export type SearchCampaignsPacingRawRow = {
  LINE_ITEM_ID: string
  CAMPAIGN_ID: string
  CAMPAIGN_NAME: string
  PLATFORM_LINE_ITEM_ID: string
  LINE_ITEM_NAME: string
  DATE_DAY: string
  AMOUNT_SPENT: number
  IMPRESSIONS: number
  CLICKS: number
  CONVERSIONS: number
  REVENUE: number
}

export type GetSearchCampaignsPacingArgs = {
  lineItemIds: string[]
  startDate: string
  endDate: string
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Returns ad-group-grain delivery rows from SEARCH_PACING_FACT for the supplied
 * line items and date range. Caller aggregates in TypeScript to line-item,
 * platform-campaign, and ad-group rollups.
 *
 * STRICT LINE_ITEM_ID matching only (no LINE_ITEM_NAME fallback).
 * Returns one row per (LINE_ITEM_ID, CAMPAIGN_ID, PLATFORM_LINE_ITEM_ID, DATE_DAY).
 */
export async function getSearchCampaignsPacingData(
  args: GetSearchCampaignsPacingArgs,
  opts?: { requestId?: string; signal?: AbortSignal }
): Promise<SearchCampaignsPacingRawRow[]> {
  if (args.lineItemIds.length === 0) return []

  const ids = Array.from(new Set(args.lineItemIds.map((s) => s.toLowerCase().trim()))).filter(Boolean)
  if (ids.length === 0) return []

  const placeholders = ids.map(() => "?").join(", ")
  const sql = `
      SELECT
        LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) AS LINE_ITEM_ID,
        CAST(CAMPAIGN_ID AS VARCHAR) AS CAMPAIGN_ID,
        MAX(CAMPAIGN_NAME) AS CAMPAIGN_NAME,
        CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
        MAX(LINE_ITEM_NAME) AS LINE_ITEM_NAME,
        TO_VARCHAR(CAST(DATE_DAY AS DATE), 'YYYY-MM-DD') AS DATE_DAY,
        SUM(AMOUNT_SPENT) AS AMOUNT_SPENT,
        SUM(IMPRESSIONS) AS IMPRESSIONS,
        SUM(CLICKS) AS CLICKS,
        SUM(CONVERSIONS) AS CONVERSIONS,
        SUM(REVENUE) AS REVENUE
      FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
      WHERE LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) IN (${placeholders})
        AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY
        LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))),
        CAST(CAMPAIGN_ID AS VARCHAR),
        CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR),
        CAST(DATE_DAY AS DATE)
      ORDER BY DATE_DAY ASC
    `

  const binds = [...ids, args.startDate, args.endDate]
  const rowsRaw = await querySnowflake<SearchCampaignsPacingRawRow>(sql, binds, {
    requestId: opts?.requestId,
    signal: opts?.signal,
    label: "search_campaigns_pacing",
  })

  const rows: SearchCampaignsPacingRawRow[] = (rowsRaw ?? []).map((r) => ({
    LINE_ITEM_ID: String(r.LINE_ITEM_ID ?? "").trim().toLowerCase(),
    CAMPAIGN_ID: String(r.CAMPAIGN_ID ?? "").trim(),
    CAMPAIGN_NAME: String(r.CAMPAIGN_NAME ?? "").trim(),
    PLATFORM_LINE_ITEM_ID: String(r.PLATFORM_LINE_ITEM_ID ?? "").trim(),
    LINE_ITEM_NAME: String(r.LINE_ITEM_NAME ?? "").trim(),
    DATE_DAY: String(r.DATE_DAY ?? "").slice(0, 10),
    AMOUNT_SPENT: toNumber(r.AMOUNT_SPENT),
    IMPRESSIONS: toNumber(r.IMPRESSIONS),
    CLICKS: toNumber(r.CLICKS),
    CONVERSIONS: toNumber(r.CONVERSIONS),
    REVENUE: toNumber(r.REVENUE),
  }))

  return rows
}
