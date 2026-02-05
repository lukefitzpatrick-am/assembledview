import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake/query"
import { get as cacheGet, set as cacheSet } from "@/lib/cache/ttlCache"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
export const maxDuration = 60

type RequestBody = {
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
}

type DailyRow = {
  lineItemId: string
  date: string
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function normalizeLineItemIds(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return []
  const set = new Set<string>()
  ids.forEach((id) => {
    const normalized = String(id ?? "").trim().toLowerCase()
    if (normalized) set.add(normalized)
  })
  return Array.from(set).sort()
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

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const t0 = Date.now()

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const ids = normalizeLineItemIds(body?.lineItemIds)
  if (!ids.length) {
    return NextResponse.json(
      { error: "lineItemIds is required and must be a non-empty array" },
      { status: 400 }
    )
  }

  const startDate = body?.startDate
  const endDate = body?.endDate
  if (!isISODate(startDate) || !isISODate(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate are required and must be YYYY-MM-DD" },
      { status: 400 }
    )
  }

  const start = startDate.trim()
  const end = endDate.trim()
  if (end < start) {
    return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 })
  }

  const TTL_SECONDS = 14_400
  const cacheKey = (() => {
    const input = { lineItemIds: ids, startDate: start, endDate: end }
    const hash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex")
    return `pacing:portfolio:${hash}`
  })()

  const cached = cacheGet<{ dataAsAt: string; daily: DailyRow[]; totals: Array<Omit<DailyRow, "date">> }>(
    cacheKey
  )
  if (cached) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[api/pacing/portfolio] cache hit", {
        requestId,
        key: cacheKey,
        ids: ids.length,
        dailyRows: cached.daily.length,
      })
    }
    return NextResponse.json(cached)
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/pacing/portfolio] cache miss", {
      requestId,
      key: cacheKey,
      ids: ids.length,
    })
  }

  const MAX_IDS_PER_CHUNK = 500
  const chunks = chunk(ids, MAX_IDS_PER_CHUNK)

  type SnowflakeRow = {
    LINE_ITEM_ID: string | null
    DATE_DAY: string
    AMOUNT_SPENT: number | null
    IMPRESSIONS: number | null
    CLICKS: number | null
    RESULTS: number | null
    VIDEO_3S_VIEWS: number | null
  }

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
        SUM(VIDEO_3S_VIEWS) AS VIDEO_3S_VIEWS
      FROM ASSEMBLEDVIEW.MART.VW_PACING_FACT
      WHERE LOWER(LINE_ITEM_ID) IN (${placeholders})
        AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
      GROUP BY LOWER(LINE_ITEM_ID), CAST(DATE_DAY AS DATE)
      ORDER BY CAST(DATE_DAY AS DATE) ASC
    `

    const binds = [...idChunk, start, end]
    const rows = await querySnowflake<SnowflakeRow>(sql, binds, {
      requestId,
      label: "pacing_portfolio",
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
      })
    })
  }

  // Totals by lineItemId
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
      } satisfies Omit<DailyRow, "date">)

    existing.amountSpent += row.amountSpent
    existing.impressions += row.impressions
    existing.clicks += row.clicks
    existing.results += row.results
    existing.video3sViews += row.video3sViews

    totalsMap.set(row.lineItemId, existing)
  })

  const totals = Array.from(totalsMap.values()).sort((a, b) =>
    a.lineItemId.localeCompare(b.lineItemId)
  )

  const maxDate = dailyAgg.length ? dailyAgg.map((r) => r.date).sort().slice(-1)[0] : null
  const dataAsAt = maxDate ?? end

  const payload = {
    dataAsAt,
    daily: dailyAgg,
    totals,
  }

  cacheSet(cacheKey, payload, TTL_SECONDS)
  const response = NextResponse.json(payload)
  response.headers.set("Cache-Control", "no-store, max-age=0")

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/pacing/portfolio] done", {
      requestId,
      ids: ids.length,
      chunks: chunks.length,
      dailyRows: dailyAgg.length,
      totals: totals.length,
      ms: Date.now() - t0,
    })
  }

  return response
}

