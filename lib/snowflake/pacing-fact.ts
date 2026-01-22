import { querySnowflake } from "@/lib/snowflake/query"

const QUERY_ROW_LIMIT = 50000
const MAX_RANGE_DAYS = 180

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

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function clampStartToMaxRange(startISO: string, endISO: string): string {
  const earliest = addDaysISO(endISO, -MAX_RANGE_DAYS)
  return startISO < earliest ? earliest : startISO
}

type QueryPacingFactOptions = {
  requestId?: string
  signal?: AbortSignal
}

export async function queryPacingFact(params: QueryPacingFactParams, options: QueryPacingFactOptions = {}) {
  const { channel, lineItemIds, startDate, endDate } = params
  const ids = lineItemIds
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)

  if (!ids.length) return []

  const placeholders = ids.map(() => "?").join(", ")

  // Snowflake CHANNEL values may not be normalised (case/wording varies),
  // so we match using LOWER() + LIKE patterns (same intent as bulk pacing query).
  const channelWhere = (() => {
    switch (channel) {
      case "meta":
        return "LOWER(CHANNEL) LIKE '%meta%'"
      case "tiktok":
        return "LOWER(CHANNEL) LIKE '%tiktok%'"
      case "programmatic-display":
        return "LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%display%'"
      case "programmatic-video":
        return "LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%video%'"
      default: {
        const exhaustive: never = channel
        throw new Error(`Unsupported pacing channel: ${String(exhaustive)}`)
      }
    }
  })()

  const baseSql = `  SELECT
    CHANNEL,
    CAST(DATE_DAY AS DATE) AS DATE_DAY,
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
  WHERE ${channelWhere}
    AND LINE_ITEM_ID IN (${placeholders})
    AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
  ORDER BY CAST(DATE_DAY AS DATE) ASC
  LIMIT ${QUERY_ROW_LIMIT}`

  const startISO = String(startDate).slice(0, 10)
  const endISO = String(endDate).slice(0, 10)
  const clampedStartISO = clampStartToMaxRange(startISO, endISO)

  const queryWindow = async (windowStartISO: string, windowEndISO: string) => {
    const binds = [...ids, windowStartISO, windowEndISO]
    return querySnowflake<PacingFactRow>(baseSql, binds, {
      requestId: options.requestId,
      signal: options.signal,
      label: `pacing_fact_${channel}`,
    })
  }

  // First, try single-shot query.
  const rows = await queryWindow(clampedStartISO, endISO)

  const hitRowLimit = rows.length === QUERY_ROW_LIMIT
  if (hitRowLimit) {
    const dateDays = rows.map((r) => r.DATE_DAY).filter(Boolean)
    const maxDateDay = dateDays.length ? dateDays.sort().slice(-1)[0] : null
    console.warn("[pacing-fact] Potential truncation: query hit row limit", {
      channel,
      rowLimit: QUERY_ROW_LIMIT,
      rowsReturned: rows.length,
      idsCount: ids.length,
      dateRange: { startDate: clampedStartISO, endDate: endISO },
      maxDateDay,
      note: "ORDER BY date ASC means latest dates may be missing if truncated",
    })
  }

  // If we hit the row limit, fall back to chunked queries by date window so we don't
  // silently drop the most recent days.
  if (!hitRowLimit) return rows

  const windowSizes = [30, 14, 7, 3, 1]
  const aggregated: PacingFactRow[] = []

  let cursorEnd = endISO
  while (cursorEnd >= clampedStartISO) {
    let fetched = false

    for (const windowDays of windowSizes) {
      const windowStart = addDaysISO(cursorEnd, -(windowDays - 1))
      const windowStartClamped = windowStart < clampedStartISO ? clampedStartISO : windowStart

      const windowRows = await queryWindow(windowStartClamped, cursorEnd)
      const windowHitLimit = windowRows.length === QUERY_ROW_LIMIT

      if (windowHitLimit && windowDays === 1) {
        // Even a single day exceeds the limit: we cannot safely return complete data.
        throw new Error(
          `[pacing-fact] Too many rows for 1-day window; cannot avoid truncation. ` +
            `channel=${channel} ids=${ids.length} date=${cursorEnd}`
        )
      }

      if (windowHitLimit) {
        // Try a smaller window size for the same cursorEnd.
        continue
      }

      aggregated.push(...windowRows)
      // Move cursorEnd to the day before this window starts.
      cursorEnd = addDaysISO(windowStartClamped, -1)
      fetched = true
      break
    }

    if (!fetched) {
      // Should be unreachable due to 1-day guard above, but keep safe.
      break
    }
  }

  aggregated.sort((a, b) => String(a.DATE_DAY ?? "").localeCompare(String(b.DATE_DAY ?? "")))
  return aggregated
}
