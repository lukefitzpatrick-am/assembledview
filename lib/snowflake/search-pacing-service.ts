import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"
import { querySnowflake } from "@/lib/snowflake/query"

const QUERY_ROW_LIMIT = 50000
const MAX_RANGE_DAYS = 180

export type SearchPacingTotals = {
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

export type SearchPacingDailyRow = {
  date: string
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

export type SearchPacingLineItemSeries = {
  lineItemId: string
  lineItemName: string | null
  totals: SearchPacingTotals
  daily: SearchPacingDailyRow[]
}

export type SearchPacingResponse = {
  totals: SearchPacingTotals
  daily: SearchPacingDailyRow[]
  lineItems: SearchPacingLineItemSeries[]
  keywords: any[]
  error?: string
}

function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value ?? NaN)
  return Number.isFinite(n) ? n : null
}

function weightedPct(sumWeighted: number, sumWeight: number): number | null {
  if (!Number.isFinite(sumWeighted) || !Number.isFinite(sumWeight) || sumWeight <= 0) return null
  return sumWeighted / sumWeight
}

function normalizeDateString(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function buildDateRange(startDate?: string, endDate?: string) {
  const end = normalizeDateString(endDate) ?? getMelbourneYesterdayISO()
  const startProvided = normalizeDateString(startDate)
  const earliestAllowed = addDaysISO(end, -MAX_RANGE_DAYS)
  const start = (() => {
    if (!startProvided) return earliestAllowed
    return startProvided < earliestAllowed ? earliestAllowed : startProvided
  })()
  return { start, end }
}

type DailySnowflakeRow = {
  DATE: string
  CLICKS: number | null
  IMPRESSIONS: number | null
  COST: number | null
  CONVERSIONS: number | null
  REVENUE: number | null
  TOP_IMPRESSION_PCT: number | null
}

type LineItemDailySnowflakeRow = DailySnowflakeRow & {
  LINE_ITEM_ID: string | null
  LINE_ITEM_NAME: string | null
}

function normalizeLineItemIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(
    new Set(
      ids
        .filter(Boolean)
        .map((id) => String(id ?? "").trim().toLowerCase())
        .filter((id) => Boolean(id) && id !== "undefined" && id !== "null")
    )
  )
}

export async function getSearchPacingData(opts: {
  lineItemIds: string[]
  startDate?: string
  endDate?: string
  requestId?: string
  signal?: AbortSignal
}): Promise<SearchPacingResponse> {
  const requestId = opts.requestId ?? "search"
  const normalizedLineItemIds = normalizeLineItemIds(opts.lineItemIds)
  if (!normalizedLineItemIds.length) {
    return { totals: emptyTotals(), daily: [], lineItems: [], keywords: [], error: "lineItemIds is required" }
  }

  const { start, end } = buildDateRange(opts.startDate, opts.endDate)
  if (!isISODate(start) || !isISODate(end)) {
    return { totals: emptyTotals(), daily: [], lineItems: [], keywords: [], error: "Invalid date range" }
  }
  if (end < start) {
    return { totals: emptyTotals(), daily: [], lineItems: [], keywords: [], error: "endDate must be >= startDate" }
  }

  const originalCount = normalizedLineItemIds.length
  const lineItemIds = normalizedLineItemIds.slice(0, 500)
  if (originalCount > 500) {
    console.warn("[search-pacing][" + requestId + "] ids truncated", {
      originalCount,
      truncatedTo: 500,
    })
  }

  const placeholders = lineItemIds.map(() => "?").join(", ")
  const dailyBinds = [...lineItemIds, start, end]

  const dailySql = `
      SELECT
        TO_VARCHAR(CAST(DATE_DAY AS DATE), 'YYYY-MM-DD') AS "DATE",
        SUM(CLICKS) AS CLICKS,
        SUM(IMPRESSIONS) AS IMPRESSIONS,
        SUM(AMOUNT_SPENT) AS COST,
        SUM(CONVERSIONS) AS CONVERSIONS,
        SUM(REVENUE) AS REVENUE,
        SUM(IMPRESSIONS * TOP_IMPRESSION_PERCENTAGE) / NULLIF(SUM(IMPRESSIONS), 0) AS TOP_IMPRESSION_PCT
      FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
      WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
        AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY CAST(DATE_DAY AS DATE)
      ORDER BY CAST(DATE_DAY AS DATE) ASC
      LIMIT ${QUERY_ROW_LIMIT}
    `

  const dailyRowsRaw = await querySnowflake<DailySnowflakeRow>(dailySql, dailyBinds, {
    requestId,
    signal: opts.signal,
    label: "pacing_search_fact_daily",
  })

  const daily: SearchPacingDailyRow[] = (dailyRowsRaw ?? []).map((r) => ({
    date: String(r.DATE ?? "").slice(0, 10),
    clicks: toNumber(r.CLICKS),
    impressions: toNumber(r.IMPRESSIONS),
    cost: toNumber(r.COST),
    conversions: toNumber(r.CONVERSIONS),
    revenue: toNumber(r.REVENUE),
    topImpressionPct: toNullableNumber(r.TOP_IMPRESSION_PCT),
  }))

  const totalsAgg = daily.reduce(
    (acc, row) => {
      acc.cost += row.cost
      acc.clicks += row.clicks
      acc.conversions += row.conversions
      acc.revenue += row.revenue
      acc.impressions += row.impressions
      if (row.topImpressionPct !== null && row.impressions > 0) {
        acc._weightedTop += row.topImpressionPct * row.impressions
        acc._topWeight += row.impressions
      }
      return acc
    },
    {
      cost: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      impressions: 0,
      _weightedTop: 0,
      _topWeight: 0,
    }
  )

  const totals: SearchPacingTotals = {
    cost: totalsAgg.cost,
    clicks: totalsAgg.clicks,
    conversions: totalsAgg.conversions,
    revenue: totalsAgg.revenue,
    impressions: totalsAgg.impressions,
    topImpressionPct: weightedPct(totalsAgg._weightedTop, totalsAgg._topWeight),
  }

  const lineItemDailySql = `
      SELECT
        LOWER(LINE_ITEM_ID) AS LINE_ITEM_ID,
        MAX(LINE_ITEM_NAME) AS LINE_ITEM_NAME,
        TO_VARCHAR(CAST(DATE_DAY AS DATE), 'YYYY-MM-DD') AS "DATE",
        SUM(CLICKS) AS CLICKS,
        SUM(IMPRESSIONS) AS IMPRESSIONS,
        SUM(AMOUNT_SPENT) AS COST,
        SUM(CONVERSIONS) AS CONVERSIONS,
        SUM(REVENUE) AS REVENUE,
        SUM(IMPRESSIONS * TOP_IMPRESSION_PERCENTAGE) / NULLIF(SUM(IMPRESSIONS), 0) AS TOP_IMPRESSION_PCT
      FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
      WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
        AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY LOWER(LINE_ITEM_ID), CAST(DATE_DAY AS DATE)
      ORDER BY LOWER(LINE_ITEM_ID) ASC, CAST(DATE_DAY AS DATE) ASC
      LIMIT ${QUERY_ROW_LIMIT}
    `

  const lineItemDailyRowsRaw = await querySnowflake<LineItemDailySnowflakeRow>(
    lineItemDailySql,
    dailyBinds,
    {
      requestId,
      signal: opts.signal,
      label: "pacing_search_fact_lineitem_daily",
    }
  )

  const seriesMap = new Map<string, { lineItemName: string | null; daily: SearchPacingDailyRow[] }>()
  ;(lineItemDailyRowsRaw ?? []).forEach((r) => {
    const id = String(r.LINE_ITEM_ID ?? "").trim()
    if (!id) return
    const key = id.toLowerCase()
    const entry = seriesMap.get(key) ?? {
      lineItemName: r.LINE_ITEM_NAME ? String(r.LINE_ITEM_NAME) : null,
      daily: [],
    }
    if (!entry.lineItemName && r.LINE_ITEM_NAME) entry.lineItemName = String(r.LINE_ITEM_NAME)
    entry.daily.push({
      date: String(r.DATE ?? "").slice(0, 10),
      clicks: toNumber(r.CLICKS),
      impressions: toNumber(r.IMPRESSIONS),
      cost: toNumber(r.COST),
      conversions: toNumber(r.CONVERSIONS),
      revenue: toNumber(r.REVENUE),
      topImpressionPct: toNullableNumber(r.TOP_IMPRESSION_PCT),
    })
    seriesMap.set(key, entry)
  })

  const lineItems: SearchPacingLineItemSeries[] = Array.from(seriesMap.entries()).map(([lineItemId, entry]) => {
    const liAgg = entry.daily.reduce(
      (acc, row) => {
        acc.cost += row.cost
        acc.clicks += row.clicks
        acc.conversions += row.conversions
        acc.revenue += row.revenue
        acc.impressions += row.impressions
        if (row.topImpressionPct !== null && row.impressions > 0) {
          acc._weightedTop += row.topImpressionPct * row.impressions
          acc._topWeight += row.impressions
        }
        return acc
      },
      {
        cost: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        impressions: 0,
        _weightedTop: 0,
        _topWeight: 0,
      }
    )

    return {
      lineItemId,
      lineItemName: entry.lineItemName,
      daily: entry.daily,
      totals: {
        cost: liAgg.cost,
        clicks: liAgg.clicks,
        conversions: liAgg.conversions,
        revenue: liAgg.revenue,
        impressions: liAgg.impressions,
        topImpressionPct: weightedPct(liAgg._weightedTop, liAgg._topWeight),
      },
    }
  })

  return { totals, daily, lineItems, keywords: [] }
}

function emptyTotals(): SearchPacingTotals {
  return {
    cost: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    impressions: 0,
    topImpressionPct: null,
  }
}

