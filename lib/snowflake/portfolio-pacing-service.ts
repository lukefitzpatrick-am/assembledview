import "server-only"

import crypto from "node:crypto"
import { get as cacheGet, set as cacheSet } from "@/lib/cache/ttlCache"
import { SOCIAL_PACING_TABLE } from "@/lib/pacing/social-channels"
import { querySnowflake } from "@/lib/snowflake/query"

const MAX_IDS_PER_CHUNK = 500
const CACHE_TTL_SECONDS = 14_400
const PROG_TABLE = "ASSEMBLEDVIEW.MART.PACING_FACT"
const SEARCH_TABLE = "ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT"
/** Bumps TTL cache when portfolio row shape / SQL changes (e.g. search union, new columns). */
const PORTFOLIO_CACHE_SCHEMA_VERSION = "v2"

export type DailyRow = {
  lineItemId: string
  date: string
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
  conversions: number
  revenue: number
}

/** Normalized input from the route after validation. */
export type PortfolioPacingInput = {
  lineItemIds: string[]
  startDate: string
  endDate: string
}

export type PortfolioPacingResult = {
  dataAsAt: string
  daily: DailyRow[]
  totals: Array<Omit<DailyRow, "date">>
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toNumber(value: any): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function portfolioCacheKey(input: PortfolioPacingInput): string {
  const keyPayload = {
    schema: PORTFOLIO_CACHE_SCHEMA_VERSION,
    lineItemIds: input.lineItemIds,
    startDate: input.startDate,
    endDate: input.endDate,
  }
  const hash = crypto.createHash("sha256").update(JSON.stringify(keyPayload)).digest("hex")
  return `pacing:portfolio:${hash}`
}

type SnowflakeRow = {
  LINE_ITEM_ID: string | null
  DATE_DAY: string
  AMOUNT_SPENT: number | null
  IMPRESSIONS: number | null
  CLICKS: number | null
  RESULTS: number | null
  VIDEO_3S_VIEWS: number | null
  CONVERSIONS: number | null
  REVENUE: number | null
}

export async function getPortfolioPacingData(
  input: PortfolioPacingInput,
  opts?: {
    requestId?: string
    signal?: AbortSignal
    /** When set (e.g. `Date.now()` at POST handler entry), dev "done" log `ms` matches pre-extraction timing. */
    startedAtMs?: number
    /** Invoked synchronously when returning a cache hit (route uses this for Cache-Control parity). */
    onCacheHit?: () => void
  }
): Promise<PortfolioPacingResult> {
  const requestId = opts?.requestId ?? crypto.randomUUID().slice(0, 8)
  const t0 = opts?.startedAtMs ?? Date.now()
  const cacheKey = portfolioCacheKey(input)

  const cached = cacheGet<PortfolioPacingResult>(cacheKey)
  if (cached) {
    opts?.onCacheHit?.()
    if (process.env.NODE_ENV !== "production") {
      console.info("[api/pacing/portfolio] cache hit", {
        requestId,
        key: cacheKey,
        ids: input.lineItemIds.length,
        dailyRows: cached.daily.length,
      })
    }
    return cached
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/pacing/portfolio] cache miss", {
      requestId,
      key: cacheKey,
      ids: input.lineItemIds.length,
    })
  }

  const chunks = chunk(input.lineItemIds, MAX_IDS_PER_CHUNK)
  const dailyAgg: DailyRow[] = []

  for (let i = 0; i < chunks.length; i++) {
    const idChunk = chunks[i]
    const placeholders = idChunk.map(() => "?").join(", ")

    const sql = `
      SELECT
        LOWER(LINE_ITEM_ID) AS LINE_ITEM_ID,
        CAST(DATE_DAY AS DATE) AS DATE_DAY,
        SUM(AMOUNT_SPENT) AS AMOUNT_SPENT,
        SUM(IMPRESSIONS) AS IMPRESSIONS,
        SUM(CLICKS) AS CLICKS,
        SUM(RESULTS) AS RESULTS,
        SUM(VIDEO_3S_VIEWS) AS VIDEO_3S_VIEWS,
        SUM(CONVERSIONS) AS CONVERSIONS,
        SUM(REVENUE) AS REVENUE
      FROM (
        SELECT
          LINE_ITEM_ID,
          DATE_DAY,
          AMOUNT_SPENT,
          IMPRESSIONS,
          CLICKS,
          RESULTS,
          VIDEO_3S_VIEWS,
          0 AS CONVERSIONS,
          0 AS REVENUE
        FROM ${SOCIAL_PACING_TABLE}
        WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
          AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
        UNION ALL
        SELECT
          LINE_ITEM_ID,
          DATE_DAY,
          AMOUNT_SPENT,
          IMPRESSIONS,
          CLICKS,
          RESULTS,
          VIDEO_3S_VIEWS,
          0 AS CONVERSIONS,
          0 AS REVENUE
        FROM ${PROG_TABLE}
        WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
          AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
        UNION ALL
        SELECT
          LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) AS LINE_ITEM_ID,
          DATE_DAY,
          AMOUNT_SPENT,
          IMPRESSIONS,
          CLICKS,
          0 AS RESULTS,
          0 AS VIDEO_3S_VIEWS,
          CONVERSIONS,
          REVENUE
        FROM ${SEARCH_TABLE}
        WHERE (
          LOWER(TRIM(COALESCE(CAST(LINE_ITEM_ID AS VARCHAR), ''))) IN (${placeholders})
          OR LOWER(TRIM(COALESCE(LINE_ITEM_NAME, ''))) IN (${placeholders})
        )
          AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
      ) combined
      GROUP BY LOWER(LINE_ITEM_ID), CAST(DATE_DAY AS DATE)
      ORDER BY CAST(DATE_DAY AS DATE) ASC
    `

    const binds = [
      ...idChunk,
      input.startDate,
      input.endDate,
      ...idChunk,
      input.startDate,
      input.endDate,
      ...idChunk,
      ...idChunk,
      input.startDate,
      input.endDate,
    ]
    const rows = await querySnowflake<SnowflakeRow>(sql, binds, {
      requestId,
      label: "pacing_portfolio",
      signal: opts?.signal,
    })

    rows.forEach((r) => {
      const lineItemId = String(r.LINE_ITEM_ID ?? "").trim().toLowerCase()
      const date = String(r.DATE_DAY ?? "").slice(0, 10)
      if (!lineItemId || !date) return
      dailyAgg.push({
        lineItemId,
        date,
        amountSpent: toNumber(r.AMOUNT_SPENT),
        impressions: toNumber(r.IMPRESSIONS),
        clicks: toNumber(r.CLICKS),
        results: toNumber(r.RESULTS),
        video3sViews: toNumber(r.VIDEO_3S_VIEWS),
        conversions: toNumber(r.CONVERSIONS),
        revenue: toNumber(r.REVENUE),
      })
    })
  }

  const totalsMap = new Map<string, Omit<DailyRow, "date">>()
  dailyAgg.forEach((row) => {
    const existing =
      totalsMap.get(row.lineItemId) ??
      ({
        lineItemId: row.lineItemId,
        amountSpent: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
        video3sViews: 0,
        conversions: 0,
        revenue: 0,
      } satisfies Omit<DailyRow, "date">)

    existing.amountSpent += row.amountSpent
    existing.impressions += row.impressions
    existing.clicks += row.clicks
    existing.results += row.results
    existing.video3sViews += row.video3sViews
    existing.conversions += row.conversions
    existing.revenue += row.revenue

    totalsMap.set(row.lineItemId, existing)
  })

  const totals = Array.from(totalsMap.values()).sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))

  const maxDate = dailyAgg.length ? dailyAgg.map((r) => r.date).sort().slice(-1)[0] : null
  const dataAsAt = maxDate ?? input.endDate

  const payload: PortfolioPacingResult = {
    dataAsAt,
    daily: dailyAgg,
    totals,
  }

  cacheSet(cacheKey, payload, CACHE_TTL_SECONDS)

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/pacing/portfolio] done", {
      requestId,
      ids: input.lineItemIds.length,
      chunks: chunks.length,
      dailyRows: dailyAgg.length,
      totals: totals.length,
      ms: Date.now() - t0,
    })
  }

  return payload
}
