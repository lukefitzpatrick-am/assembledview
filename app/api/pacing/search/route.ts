import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { querySnowflake } from "@/lib/snowflake/query"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
// NOTE: Vercel functions default to 15s; pacing can exceed this during cold warehouse resume.
export const maxDuration = 60

const INTERNAL_TIMEOUT_MS = 55_000

type Totals = {
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

type DailyRow = {
  date: string
  cost: number
  clicks: number
  conversions: number
  revenue: number
  impressions: number
  topImpressionPct: number | null
}

type KeywordRow = {
  keywordId: string
  keywordName: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  revenue: number
  topImpressionPct: number | null
  absTopImpressionPct: number | null
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

type DailySnowflakeRow = {
  DATE: string
  CLICKS: number | null
  IMPRESSIONS: number | null
  COST: number | null
  CONVERSIONS: number | null
  REVENUE: number | null
  TOP_IMPRESSION_PCT: number | null
}

type KeywordSnowflakeRow = {
  KEYWORD_ID: string | null
  KEYWORD_NAME: string | null
  CLICKS: number | null
  IMPRESSIONS: number | null
  COST: number | null
  CONVERSIONS: number | null
  REVENUE: number | null
  TOP_IMPRESSION_PCT: number | null
  ABS_TOP_IMPRESSION_PCT: number | null
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const t0 = Date.now()

  // Auth: keep aligned with app API expectations (JSON on unauthenticated requests).
  const session = await auth0.getSession(request)
  if (!session) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  const mbaNumber = request.nextUrl.searchParams.get("mbaNumber")?.trim() ?? ""
  const startDate = request.nextUrl.searchParams.get("startDate")?.trim() ?? ""
  const endDate = request.nextUrl.searchParams.get("endDate")?.trim() ?? ""

  if (!mbaNumber) {
    return NextResponse.json({ error: "mbaNumber is required" }, { status: 400 })
  }
  if (!isISODate(startDate) || !isISODate(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate are required and must be YYYY-MM-DD" },
      { status: 400 }
    )
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 })
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), INTERNAL_TIMEOUT_MS)

  try {
    // 1) Daily rows: base metrics + top impression pct selection (Google preferred, else Bing)
    const dailySql = `
      WITH base AS (
        SELECT
          CAST("DATE" AS DATE) AS "DATE",
          SUM(CLICKS) AS CLICKS,
          SUM(IMPRESSIONS) AS IMPRESSIONS,
          SUM(COST) AS COST,
          SUM(CONVERSIONS) AS CONVERSIONS,
          SUM(REVENUE) AS REVENUE
        FROM ASSEMBLEDVIEW.MART.VW_PACING_SEARCH_DAILY
        WHERE MBA_NUMBER = ?
          AND CAST("DATE" AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
        GROUP BY CAST("DATE" AS DATE)
      ),
      google_top AS (
        SELECT
          CAST("DATE" AS DATE) AS "DATE",
          SUM(IMPRESSIONS * TOP_IMPRESSION_PCT) AS WEIGHTED,
          SUM(IMPRESSIONS) AS WEIGHT
        FROM ASSEMBLEDVIEW.MART.VW_PACING_SEARCH_KEYWORD_DAILY
        WHERE MBA_NUMBER = ?
          AND CAST("DATE" AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
          AND LOWER(PLATFORM) LIKE '%google%'
        GROUP BY CAST("DATE" AS DATE)
      ),
      bing_top AS (
        SELECT
          CAST("DATE" AS DATE) AS "DATE",
          SUM(IMPRESSIONS * TOP_IMPRESSION_PCT) AS WEIGHTED,
          SUM(IMPRESSIONS) AS WEIGHT
        FROM ASSEMBLEDVIEW.MART.VW_PACING_SEARCH_DAILY
        WHERE MBA_NUMBER = ?
          AND CAST("DATE" AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
          AND LOWER(PLATFORM) LIKE '%bing%'
        GROUP BY CAST("DATE" AS DATE)
      )
      SELECT
        b."DATE" AS "DATE",
        b.CLICKS,
        b.IMPRESSIONS,
        b.COST,
        b.CONVERSIONS,
        b.REVENUE,
        COALESCE(
          google_top.WEIGHTED / NULLIF(google_top.WEIGHT, 0),
          bing_top.WEIGHTED / NULLIF(bing_top.WEIGHT, 0)
        ) AS TOP_IMPRESSION_PCT
      FROM base b
      LEFT JOIN google_top ON google_top."DATE" = b."DATE"
      LEFT JOIN bing_top ON bing_top."DATE" = b."DATE"
      ORDER BY b."DATE" ASC
    `
    const dailyBinds = [
      mbaNumber,
      startDate,
      endDate,
      mbaNumber,
      startDate,
      endDate,
      mbaNumber,
      startDate,
      endDate,
    ]

    const dailyRowsRaw = await querySnowflake<DailySnowflakeRow>(dailySql, dailyBinds, {
      requestId,
      signal: ac.signal,
      label: "pacing_search_daily",
    })

    const daily: DailyRow[] = (dailyRowsRaw ?? []).map((r) => ({
      date: String(r.DATE ?? "").slice(0, 10),
      clicks: toNumber(r.CLICKS),
      impressions: toNumber(r.IMPRESSIONS),
      cost: toNumber(r.COST),
      conversions: toNumber(r.CONVERSIONS),
      revenue: toNumber(r.REVENUE),
      topImpressionPct: toNullableNumber(r.TOP_IMPRESSION_PCT),
    }))

    // 2) Totals: sum daily; topImpressionPct weighted by impressions across full range.
    const totals = daily.reduce(
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

    const totalsOut: Totals = {
      cost: totals.cost,
      clicks: totals.clicks,
      conversions: totals.conversions,
      revenue: totals.revenue,
      impressions: totals.impressions,
      topImpressionPct: weightedPct(totals._weightedTop, totals._topWeight),
    }

    // 3) Keywords: top 100 by clicks desc, then cost desc.
    const keywordsSql = `
      WITH agg AS (
        SELECT
          KEYWORD_ID,
          KEYWORD_NAME,
          SUM(CLICKS) AS CLICKS,
          SUM(IMPRESSIONS) AS IMPRESSIONS,
          SUM(COST) AS COST,
          SUM(CONVERSIONS) AS CONVERSIONS,
          SUM(REVENUE) AS REVENUE,
          SUM(IMPRESSIONS * TOP_IMPRESSION_PCT) AS TOP_WEIGHTED,
          SUM(IMPRESSIONS * ABS_TOP_IMPRESSION_PCT) AS ABS_TOP_WEIGHTED,
          SUM(IMPRESSIONS) AS WEIGHT
        FROM ASSEMBLEDVIEW.MART.VW_PACING_SEARCH_KEYWORD_DAILY
        WHERE MBA_NUMBER = ?
          AND CAST("DATE" AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
        GROUP BY KEYWORD_ID, KEYWORD_NAME
      )
      SELECT
        KEYWORD_ID,
        KEYWORD_NAME,
        CLICKS,
        IMPRESSIONS,
        COST,
        CONVERSIONS,
        REVENUE,
        TOP_WEIGHTED / NULLIF(WEIGHT, 0) AS TOP_IMPRESSION_PCT,
        ABS_TOP_WEIGHTED / NULLIF(WEIGHT, 0) AS ABS_TOP_IMPRESSION_PCT
      FROM agg
      QUALIFY ROW_NUMBER() OVER (ORDER BY CLICKS DESC, COST DESC) <= 100
    `
    const keywordRowsRaw = await querySnowflake<KeywordSnowflakeRow>(
      keywordsSql,
      [mbaNumber, startDate, endDate],
      {
        requestId,
        signal: ac.signal,
        label: "pacing_search_keywords",
      }
    )

    const keywords: KeywordRow[] = (keywordRowsRaw ?? [])
      .map((r) => {
        const keywordId = String(r.KEYWORD_ID ?? "").trim()
        const keywordName = String(r.KEYWORD_NAME ?? "").trim()
        if (!keywordId && !keywordName) return null
        return {
          keywordId,
          keywordName,
          clicks: toNumber(r.CLICKS),
          impressions: toNumber(r.IMPRESSIONS),
          cost: toNumber(r.COST),
          conversions: toNumber(r.CONVERSIONS),
          revenue: toNumber(r.REVENUE),
          topImpressionPct: toNullableNumber(r.TOP_IMPRESSION_PCT),
          absTopImpressionPct: toNullableNumber(r.ABS_TOP_IMPRESSION_PCT),
        }
      })
      .filter((v): v is KeywordRow => Boolean(v))

    const response = NextResponse.json({ totals: totalsOut, daily, keywords })
    response.headers.set("Cache-Control", "no-store, max-age=0")

    if (process.env.NODE_ENV !== "production") {
      console.info("[api/pacing/search] done", {
        requestId,
        mbaNumber,
        startDate,
        endDate,
        daily: daily.length,
        keywords: keywords.length,
        ms: Date.now() - t0,
      })
    }

    return response
  } catch (err) {
    const isAbortError = Boolean(err && typeof err === "object" && (err as any).name === "AbortError")
    if (isAbortError || ac.signal.aborted) {
      return NextResponse.json({ error: "Timed out" }, { status: 504 })
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/pacing/search] error", { requestId, ms: Date.now() - t0, message })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  } finally {
    clearTimeout(timer)
  }
}

