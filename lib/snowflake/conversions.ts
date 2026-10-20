import "server-only"

import { normalizeDailyFactDate } from "@/lib/pacing/detail/dailyFromFacts"
import { querySnowflake } from "@/lib/snowflake/query"
import type { ConversionEventChoice, ConversionFactRow } from "@/lib/delivery/conversions/rules"

/**
 * Reads MART.VW_CONVERSION_DAILY (CF1, sql/snowflake/mart/views/vw_conversion_daily.sql).
 * Columns: CHANNEL, DATE_DAY, PLATFORM_LINE_ITEM_ID, PLATFORM, EVENT_KEY, EVENT_NAME,
 * EVENT_CATEGORY, CONVERSIONS, CONVERSION_VALUE, MAX_FIVETRAN_SYNCED_AT, UPDATED_AT, LINE_ITEM_ID.
 */

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const MAX_LINE_IDS = 500
const MAX_EVENTS = 200

/** Daily rows for chosen events on the given plan line ids. */
export async function queryConversionRows(args: {
  lineItemIds: readonly string[]
  startDate: string
  endDate: string
  events: readonly Pick<ConversionEventChoice, "platform" | "eventKey">[]
  requestId?: string
  signal?: AbortSignal
}): Promise<ConversionFactRow[]> {
  const ids = Array.from(new Set(args.lineItemIds.map((s) => String(s).trim().toLowerCase())))
    .filter(Boolean)
    .slice(0, MAX_LINE_IDS)
  const events = args.events.slice(0, MAX_EVENTS)
  if (ids.length === 0 || events.length === 0) return []

  const idMarks = ids.map(() => "?").join(", ")
  const eventMarks = events.map(() => "(?, ?)").join(", ")
  const sql = `
    SELECT
      LOWER(TRIM(LINE_ITEM_ID)) AS LINE_ITEM_ID,
      TO_VARCHAR(DATE_DAY, 'YYYY-MM-DD') AS DATE_DAY,
      PLATFORM,
      EVENT_KEY,
      SUM(COALESCE(CONVERSIONS, 0)) AS CONVERSIONS,
      SUM(CONVERSION_VALUE) AS CONVERSION_VALUE
    FROM ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY
    WHERE LOWER(TRIM(LINE_ITEM_ID)) IN (${idMarks})
      AND DATE_DAY BETWEEN TO_DATE(?) AND TO_DATE(?)
      AND (PLATFORM, EVENT_KEY) IN (${eventMarks})
    GROUP BY 1, 2, 3, 4
    ORDER BY 2
  `
  const binds = [
    ...ids,
    args.startDate,
    args.endDate,
    ...events.flatMap((e) => [e.platform, e.eventKey]),
  ]
  const raw = await querySnowflake<Record<string, unknown>>(sql, binds, {
    requestId: args.requestId,
    signal: args.signal,
    label: "conversion_daily",
  })
  return (raw ?? []).map((r) => ({
    lineItemId: String(r.LINE_ITEM_ID ?? "").trim().toLowerCase(),
    date: normalizeDailyFactDate(r.DATE_DAY) ?? "",
    platform: String(r.PLATFORM ?? ""),
    eventKey: String(r.EVENT_KEY ?? ""),
    conversions: toNumber(r.CONVERSIONS),
    conversionValue: r.CONVERSION_VALUE == null ? null : toNumber(r.CONVERSION_VALUE),
  }))
}

export type AvailableConversionEvent = {
  platform: string
  eventKey: string
  eventName: string
  eventCategory: string
  conversions: number
  conversionValue: number
  lineCount: number
}

/**
 * Events seen for a client's lines (line ids starting with the client's
 * mbaidentifier) in the last `days` days, with counts and values so staff can
 * tell aliases apart.
 */
export async function queryAvailableConversionEvents(args: {
  mbaidentifier: string
  days?: number
  requestId?: string
}): Promise<AvailableConversionEvent[]> {
  const prefix = args.mbaidentifier.trim().toLowerCase()
  if (!prefix) return []
  const days = Math.max(1, Math.min(400, Math.round(args.days ?? 180)))
  const sql = `
    SELECT
      PLATFORM,
      EVENT_KEY,
      MAX(EVENT_NAME) AS EVENT_NAME,
      MAX(EVENT_CATEGORY) AS EVENT_CATEGORY,
      SUM(COALESCE(CONVERSIONS, 0)) AS CONVERSIONS,
      SUM(COALESCE(CONVERSION_VALUE, 0)) AS CONVERSION_VALUE,
      COUNT(DISTINCT LINE_ITEM_ID) AS LINE_COUNT
    FROM ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY
    WHERE STARTSWITH(LOWER(TRIM(LINE_ITEM_ID)), ?)
      AND DATE_DAY >= DATEADD(day, ?, CURRENT_DATE())
    GROUP BY 1, 2
    HAVING SUM(COALESCE(CONVERSIONS, 0)) <> 0 OR SUM(COALESCE(CONVERSION_VALUE, 0)) <> 0
    ORDER BY 1, 5 DESC
  `
  const raw = await querySnowflake<Record<string, unknown>>(sql, [prefix, -days], {
    requestId: args.requestId,
    label: "conversion_events_available",
  })
  return (raw ?? []).map((r) => ({
    platform: String(r.PLATFORM ?? ""),
    eventKey: String(r.EVENT_KEY ?? ""),
    eventName: String(r.EVENT_NAME ?? r.EVENT_KEY ?? ""),
    eventCategory: String(r.EVENT_CATEGORY ?? "other"),
    conversions: toNumber(r.CONVERSIONS),
    conversionValue: toNumber(r.CONVERSION_VALUE),
    lineCount: toNumber(r.LINE_COUNT),
  }))
}
