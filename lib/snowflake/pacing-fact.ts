import { querySnowflake } from "@/lib/snowflake/query"

export type PacingFactRow = {
  CHANNEL: string
  DATE_DAY: string
  LINE_ITEM_ID: string | null
  ENTITY_NAME: string | null
  ENTITY_ID: string | null
  CAMPAIGN_NAME: string | null
  AMOUNT_SPENT: number | null
  IMPRESSIONS: number | null
  CLICKS: number | null
  RESULTS: number | null
  VIDEO_3S_VIEWS: number | null
  MAX_FIVETRAN_SYNCED_AT: string | null
  UPDATED_AT: string | null
}

type Channel = "meta" | "tiktok" | "programmatic-display" | "programmatic-video"

type QueryPacingFactParams = {
  channel: Channel
  lineItemIds: string[]
  startDate: string
  endDate: string
}

export async function queryPacingFact(params: QueryPacingFactParams) {
  const { channel, lineItemIds, startDate, endDate } = params
  const ids = lineItemIds
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)

  if (!ids.length) return []

  const placeholders = ids.map(() => "?").join(", ")

  const sql = `  SELECT
    CHANNEL,
    DATE_DAY,
    LINE_ITEM_ID,
    ENTITY_NAME,
    ENTITY_ID,
    CAMPAIGN_NAME,
    AMOUNT_SPENT,
    IMPRESSIONS,
    CLICKS,
    RESULTS,
    VIDEO_3S_VIEWS,
    MAX_FIVETRAN_SYNCED_AT,
    UPDATED_AT
  FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE CHANNEL = ?
    AND LINE_ITEM_ID IN (${placeholders})
    AND DATE_DAY BETWEEN TO_DATE(?) AND TO_DATE(?)
  ORDER BY DATE_DAY ASC
  LIMIT 50000`

  const binds = [channel, ...ids, startDate, endDate]

  return querySnowflake<PacingFactRow>(sql, binds)
}
