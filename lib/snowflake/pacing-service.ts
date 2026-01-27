import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import { getMelbourneTodayISO, getMelbourneYesterdayISO } from "@/lib/dates/melbourne"

type Channel = "meta" | "tiktok" | "programmatic-display" | "programmatic-video"

export type PacingRow = {
  channel: Channel
  dateDay: string
  adsetName: string | null
  entityName: string | null
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  entityId: string | null
  lineItemId: string | null
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
  maxFivetranSyncedAt: string | null
  updatedAt: string | null
}

type RawRow = {
  CHANNEL: string
  DATE_DAY: string
  LINE_ITEM_ID: string | null
  ADSET_NAME: string | null
  ADSET_ID: string | null
  CAMPAIGN_ID: string | null
  CAMPAIGN_NAME: string | null
  AMOUNT_SPENT: number | null
  IMPRESSIONS: number | null
  CLICKS: number | null
  RESULTS: number | null
  VIDEO_3S_VIEWS: number | null
  MAX_FIVETRAN_SYNCED_AT: string | null
  UPDATED_AT: string | null
}

const MAX_RANGE_DAYS = 180
const MAX_IDS = 500
const QUERY_ROW_LIMIT = 50000
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const ALLOWED_CHANNELS: Channel[] = ["meta", "tiktok", "programmatic-display", "programmatic-video"]

type GetCampaignPacingDataOptions = {
  requestId?: string
  signal?: AbortSignal
}

type GetCampaignPacingDataParams = {
  startDate?: string
  endDate?: string
}

function normalizeDateString(value?: string | null) {
  if (!value) return null
  const trimmed = String(value).trim()

  // Treat YYYY-MM-DD as an already-normalized ISO date.
  // Important: `new Date('YYYY-MM-DD')` is parsed as UTC, and applying setHours()
  // in a non-UTC environment can shift the day backwards (e.g. AU local dev).
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function clampDateRange(startDate?: string, endDate?: string) {
  const melbourneTodayISO = getMelbourneTodayISO()
  const melbourneYesterdayISO = getMelbourneYesterdayISO()
  
  // Normalize provided end date
  const normalizedEnd = normalizeDateString(endDate)
  
  // Determine end: use provided end if it's before today (completed campaign), otherwise default to Melbourne yesterday
  let end: string
  
  if (normalizedEnd && normalizedEnd < melbourneTodayISO) {
    // Completed campaign: use provided end date
    end = normalizedEnd
  } else {
    // Active campaign: default to Melbourne yesterday (not server UTC yesterday)
    end = normalizedEnd && normalizedEnd < melbourneYesterdayISO
      ? normalizedEnd
      : melbourneYesterdayISO
  }
  
  // Clamp start date
  const endDateObj = new Date(end)
  const earliestAllowed = new Date(endDateObj.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
  const startProvided = normalizeDateString(startDate)
  const start =
    startProvided && startProvided >= earliestAllowed.toISOString().slice(0, 10)
      ? startProvided
      : earliestAllowed.toISOString().slice(0, 10)

  return { start, end }
}

function prepareIds(lineItemIds?: string[] | null) {
  if (!Array.isArray(lineItemIds)) return []
  const unique = new Set<string>()
  lineItemIds.forEach((id) => {
    const normalized = String(id).trim()
    if (normalized) unique.add(normalized.toLowerCase())
  })
  return Array.from(unique).sort()
}

export async function getCampaignPacingData(
  mbaNumber: string | null | undefined,
  lineItemIds: string[] | null | undefined,
  params?: GetCampaignPacingDataParams,
  options?: GetCampaignPacingDataOptions
): Promise<PacingRow[]> {
  if (!mbaNumber) {
    throw new Error("mbaNumber is required")
  }

  const requestId = options?.requestId ?? Math.random().toString(36).slice(2, 10)

  let normalizedIds = prepareIds(lineItemIds)
  if (!normalizedIds.length) {
    return []
  }

  if (normalizedIds.length > MAX_IDS) {
    if (DEBUG_PACING) {
      console.warn("[Pacing] truncating id list to limit", {
        mbaNumber,
        idCount: normalizedIds.length,
        max: MAX_IDS,
      })
    }
    normalizedIds = normalizedIds.slice(0, MAX_IDS)
  }

  const { start, end } = clampDateRange(params?.startDate, params?.endDate)

  if (DEBUG_PACING) {
    console.log("[Pacing] query input", {
      mbaNumber,
      idsCount: normalizedIds.length,
      dateRange: { start, end },
    })
  }

  const buildStart = Date.now()
  const placeholders = normalizedIds.map(() => "?").join(", ")

  const sql = `
  /* QUERY_TAG: bulk_pacing */
  WITH maxd AS (
    SELECT MAX(CAST(DATE_DAY AS DATE)) AS max_date
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
  ),
  bounds AS (
    SELECT
      TO_DATE(?) AS start_date,
      LEAST(TO_DATE(?), maxd.max_date) AS end_date
    FROM maxd
  )
  SELECT
    /* normalised channel values for the app */
    CASE
      WHEN LOWER(CHANNEL) LIKE '%meta%' THEN 'meta'
      WHEN LOWER(CHANNEL) LIKE '%tiktok%' THEN 'tiktok'
      WHEN LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%display%' THEN 'programmatic-display'
      WHEN LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%video%' THEN 'programmatic-video'
      ELSE LOWER(CHANNEL)
    END AS CHANNEL,
    CAST(DATE_DAY AS DATE) AS DATE_DAY,
    /* alias to existing field names so containers don’t change */
    ENTITY_NAME AS ADSET_NAME,
    NULL AS CAMPAIGN_ID,
    CAMPAIGN_NAME,
    ENTITY_ID AS ADSET_ID,
    LINE_ITEM_ID,
    AMOUNT_SPENT,
    IMPRESSIONS,
    CLICKS,
    RESULTS,
    VIDEO_3S_VIEWS,
    MAX_FIVETRAN_SYNCED_AT,
    UPDATED_AT
  FROM ASSEMBLEDVIEW.MART.PACING_FACT, bounds
  WHERE bounds.end_date IS NOT NULL
    AND CAST(DATE_DAY AS DATE) BETWEEN bounds.start_date AND bounds.end_date
    AND LOWER(LINE_ITEM_ID) IN (${placeholders})
  -- Important: order newest-first under LIMIT so recent days aren't truncated away.
  ORDER BY CAST(DATE_DAY AS DATE) DESC, CHANNEL ASC
  LIMIT ${QUERY_ROW_LIMIT}
`

  // binds order: ids for maxd, then start/end bounds, then ids for final select
  const binds = [...normalizedIds, start, end, ...normalizedIds]
  console.info("[pacing-service][timing] build", {
    requestId,
    ms: Date.now() - buildStart,
    idsCount: normalizedIds.length,
  })

  // ============================================================================
  // PERFORMANCE: Track query execution time
  // ============================================================================
  const queryStartTime = Date.now()

  const rows = await querySnowflake<RawRow>(sql, binds, {
    requestId,
    signal: options?.signal,
    label: "pacing_bulk",
  })

  // Calculate query duration
  const queryDurationMs = Date.now() - queryStartTime
  console.info("[pacing-service][timing] query", { requestId, ms: queryDurationMs, rows: rows.length })

  // If we hit the hard row limit, Snowflake will drop the newest days first
  // when ordering ASC. We order DESC, so this will drop the oldest rows first.
  const hitRowLimit = rows.length === QUERY_ROW_LIMIT
  if (hitRowLimit) {
    console.warn("[Pacing] Potential truncation: query hit row limit", {
      mbaNumber,
      rowLimit: QUERY_ROW_LIMIT,
      rawRowsReturned: rows.length,
      lineItemCount: normalizedIds.length,
      dateRange: { start, end },
      note: "ORDER BY date DESC means oldest dates may be missing if truncated",
    })
  }

  const unknownChannels = new Set<string>()
  const filteredRows = rows.filter((row) => {
    const channel = String(row.CHANNEL ?? "").toLowerCase()
    const allowed = (ALLOWED_CHANNELS as string[]).includes(channel)
    if (!allowed) {
      unknownChannels.add(channel)
    }
    return allowed
  })

  // ============================================================================
  // PERFORMANCE LOGGING: Always log query performance metrics
  // ============================================================================
  const channelCounts = filteredRows.reduce((acc, row) => {
    const channel = String(row.CHANNEL ?? "").toLowerCase()
    acc[channel] = (acc[channel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const avgRowsPerLineItem = normalizedIds.length > 0
    ? Number((filteredRows.length / normalizedIds.length).toFixed(2))
    : 0

  console.log("[Pacing] Query performance", {
    mbaNumber,
    durationMs: queryDurationMs,
    rawRowsReturned: rows.length,
    rowsReturned: filteredRows.length,
    lineItemCount: normalizedIds.length,
    avgRowsPerLineItem,
    channels: channelCounts,
    dateRange: { start, end },
    hitRowLimit,
  })

  // ============================================================================
  // WARNING: Log warning if query returns 0 rows but line items were provided
  // ============================================================================
  if (filteredRows.length === 0 && normalizedIds.length > 0) {
    console.warn("[Pacing] Zero rows returned for provided line items", {
      mbaNumber,
      lineItemCount: normalizedIds.length,
      lineItemSample: normalizedIds.slice(0, 5),
      dateRange: { start, end },
      unknownChannels: unknownChannels.size ? Array.from(unknownChannels) : undefined,
    })
  }

  // ============================================================================
  // DEBUG: Extended logging when DEBUG_PACING is enabled
  // ============================================================================
  if (DEBUG_PACING) {
    const distinctChannels = new Set(
      filteredRows.map((row) => String(row.CHANNEL ?? "").toLowerCase())
    )

    // Log query plan details
    console.log("[Pacing] Query plan details", {
      mbaNumber,
      sql: sql.trim().slice(0, 200) + "...",
      bindCount: binds.length,
      placeholderCount: normalizedIds.length,
      dateBinds: { start, end },
    })

    console.log("[Pacing] Query result details", {
      mbaNumber,
      idsCount: normalizedIds.length,
      dateRange: { start, end },
      rowsReturned: filteredRows.length,
      rawRowsBeforeFilter: rows.length,
      distinctChannels: Array.from(distinctChannels),
      unknownChannels: unknownChannels.size ? Array.from(unknownChannels) : undefined,
    })

    // Probe query when zero rows returned
    if (filteredRows.length === 0) {
      try {
        const probePlaceholders = normalizedIds.map(() => "?").join(", ")
        const probeSql = `
          SELECT DISTINCT CHANNEL, LINE_ITEM_ID
          FROM ASSEMBLEDVIEW.MART.PACING_FACT
          WHERE LINE_ITEM_ID IN (${probePlaceholders})
          LIMIT 10
        `
        const probeMatches = await querySnowflake<{ CHANNEL: string; LINE_ITEM_ID: string }>(
          probeSql,
          normalizedIds,
          { requestId, signal: options?.signal, label: "pacing_zero_row_probe" }
        )

        console.log("[Pacing] Zero-row probe results", {
          mbaNumber,
          idsCount: normalizedIds.length,
          probeMatchesLength: probeMatches.length,
          probeMatchesSample: probeMatches,
          suggestion: probeMatches.length > 0
            ? "Data exists but outside date range"
            : "No data found for these line item IDs",
        })
      } catch (error) {
        console.error("[Pacing] Zero-row probe failed", {
          mbaNumber,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const mappedRows = filteredRows.map((row) => {
    const channel = String(row.CHANNEL ?? "").toLowerCase() as Channel
    const dateDay = normalizeDateString(row.DATE_DAY) ?? String(row.DATE_DAY ?? "")
    const lineItemId =
      row.LINE_ITEM_ID && String(row.LINE_ITEM_ID).trim()
        ? String(row.LINE_ITEM_ID).trim().toLowerCase()
        : null

    return {
      channel,
      dateDay,
      adsetName: row.ADSET_NAME ?? null,
      entityName: row.ADSET_NAME ?? null,
      campaignId: row.CAMPAIGN_ID ?? null,
      campaignName: row.CAMPAIGN_NAME ?? null,
      adsetId: row.ADSET_ID ?? null,
      entityId: row.ADSET_ID ?? null,
      lineItemId,
      amountSpent: Number(row.AMOUNT_SPENT ?? 0),
      impressions: Number(row.IMPRESSIONS ?? 0),
      clicks: Number(row.CLICKS ?? 0),
      results: Number(row.RESULTS ?? 0),
      video3sViews: Number(row.VIDEO_3S_VIEWS ?? 0),
      maxFivetranSyncedAt: row.MAX_FIVETRAN_SYNCED_AT ?? null,
      updatedAt: row.UPDATED_AT ?? null,
    }
  })

  // Preserve existing consumer expectations (ascending by date) even though we query DESC under the LIMIT.
  mappedRows.sort((a, b) => {
    const dateCmp = String(a.dateDay ?? "").localeCompare(String(b.dateDay ?? ""))
    if (dateCmp !== 0) return dateCmp
    const channelCmp = String(a.channel ?? "").localeCompare(String(b.channel ?? ""))
    if (channelCmp !== 0) return channelCmp
    return String(a.lineItemId ?? "").localeCompare(String(b.lineItemId ?? ""))
  })

  return mappedRows
}
