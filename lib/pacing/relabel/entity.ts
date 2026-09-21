import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import {
  asIsoDate,
  cardChannelFromWarehouse,
  factRouteForChannel,
  normalizeLineItemId,
} from "./channels"
import type {
  RelabelEntity,
  RelabelEntityAttribution,
  RelabelFactRoute,
  RelabelQueryFn,
} from "./types"

function factKeySql(key: RelabelFactRoute["primaryKey"]): string {
  return key === "line_item_name" ? "LINE_ITEM_NAME" : "PLATFORM_LINE_ITEM_ID"
}

export function buildResolveEntitySql(route: RelabelFactRoute): string {
  const primary = factKeySql(route.primaryKey)
  const fallback = route.fallbackKey ? factKeySql(route.fallbackKey) : null
  const match = fallback
    ? `(LOWER(TRIM(CAST(${primary} AS VARCHAR))) = LOWER(TRIM(?))
        OR LOWER(TRIM(CAST(${fallback} AS VARCHAR))) = LOWER(TRIM(?)))`
    : `LOWER(TRIM(CAST(${primary} AS VARCHAR))) = LOWER(TRIM(?))`
  return `
    SELECT
      ANY_VALUE(COALESCE(
        NULLIF(TRIM(CAST(ENTITY_NAME AS VARCHAR)), ''),
        NULLIF(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)), ''),
        TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))
      )) AS ENTITY_NAME,
      LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) AS LINE_ITEM_ID,
      MIN(CAST(DATE_DAY AS DATE)) AS DATE_FROM,
      MAX(CAST(DATE_DAY AS DATE)) AS DATE_TO,
      COUNT(DISTINCT CAST(DATE_DAY AS DATE)) AS DAY_COUNT,
      SUM(AMOUNT_SPENT) AS SPEND,
      SUM(IMPRESSIONS) AS IMPRESSIONS
    FROM ${route.table}
    WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
      AND ${match}
    GROUP BY LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR)))
    ORDER BY MIN(CAST(DATE_DAY AS DATE))
  `
}

export function buildMoveRowsSql(
  route: RelabelFactRoute,
  opts: { dateFrom?: string | null; dateTo?: string | null },
): string {
  const primary = factKeySql(route.primaryKey)
  const fallback = route.fallbackKey ? factKeySql(route.fallbackKey) : null
  const match = fallback
    ? `(LOWER(TRIM(CAST(${primary} AS VARCHAR))) = LOWER(TRIM(?))
        OR LOWER(TRIM(CAST(${fallback} AS VARCHAR))) = LOWER(TRIM(?)))`
    : `LOWER(TRIM(CAST(${primary} AS VARCHAR))) = LOWER(TRIM(?))`
  const fromClause = opts.dateFrom ? "AND CAST(DATE_DAY AS DATE) >= CAST(? AS DATE)" : ""
  const toClause = opts.dateTo ? "AND CAST(DATE_DAY AS DATE) <= CAST(? AS DATE)" : ""
  return `
    SELECT
      CAST(DATE_DAY AS DATE) AS DATE_DAY,
      LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) AS LINE_ITEM_ID,
      TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)) AS LINE_ITEM_NAME,
      TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR)) AS PLATFORM_LINE_ITEM_ID,
      AMOUNT_SPENT,
      IMPRESSIONS,
      CLICKS,
      RESULTS
    FROM ${route.table}
    WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
      AND ${match}
      ${fromClause}
      ${toClause}
    ORDER BY CAST(DATE_DAY AS DATE)
  `
}

function entityBinds(channel: string, platformEntityId: string, route: RelabelFactRoute): unknown[] {
  const id = String(platformEntityId).trim()
  return route.fallbackKey ? [channel, id, id] : [channel, id]
}

export async function resolveEntity(
  args: { channel: string; platformEntityId: string },
  query: RelabelQueryFn,
): Promise<RelabelEntity> {
  const channel = String(args.channel ?? "").trim()
  const platformEntityId = String(args.platformEntityId ?? "").trim()
  const route = factRouteForChannel(channel)
  const rows = await query(buildResolveEntitySql(route), entityBinds(channel, platformEntityId, route))

  const attributions: RelabelEntityAttribution[] = rows.map((row) => ({
    lineItemId: normalizeLineItemId(row.LINE_ITEM_ID as string | null) || null,
    dateFrom: asIsoDate(row.DATE_FROM),
    dateTo: asIsoDate(row.DATE_TO),
    dayCount: Number(row.DAY_COUNT) || 0,
    spend: Number(row.SPEND) || 0,
    impressions: Number(row.IMPRESSIONS) || 0,
  }))

  const entityName =
    String(rows[0]?.ENTITY_NAME ?? "").trim() ||
    platformEntityId

  return {
    channel,
    platformEntityId,
    entityName,
    cardChannel: cardChannelFromWarehouse(channel),
    route,
    attributions,
  }
}

export function mbaFromLineItemId(lineItemId: string): string | null {
  const parsed = parseMbaNumberFromLineItemId(lineItemId)
  return parsed ? parsed.toLowerCase() : null
}

export const LABEL_MAP_ACTIVE_SQL = `
  SELECT
    CHANNEL,
    CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
    CAST(LINE_ITEM_ID AS VARCHAR) AS LINE_ITEM_ID,
    CAST(LINE_ITEM_NAME AS VARCHAR) AS LINE_ITEM_NAME,
    CAST(MBA_NUMBER AS VARCHAR) AS MBA_NUMBER,
    CAST(NOTES AS VARCHAR) AS NOTES
  FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
  WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
    AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
    AND IS_ACTIVE = TRUE
`

export async function queryActiveLabelMap(
  args: { channel: string; platformEntityId: string },
  query: RelabelQueryFn,
): Promise<import("./types").RelabelActiveMap | null> {
  const rows = await query(LABEL_MAP_ACTIVE_SQL, [args.channel, args.platformEntityId])
  const row = rows[0]
  if (!row) return null
  return {
    channel: String(row.CHANNEL ?? args.channel),
    platformLineItemId: String(row.PLATFORM_LINE_ITEM_ID ?? args.platformEntityId),
    lineItemId: normalizeLineItemId(row.LINE_ITEM_ID as string | null) || null,
    lineItemName: row.LINE_ITEM_NAME == null ? null : String(row.LINE_ITEM_NAME),
    mbaNumber: row.MBA_NUMBER == null ? null : String(row.MBA_NUMBER),
    notes: row.NOTES == null ? null : String(row.NOTES),
  }
}
