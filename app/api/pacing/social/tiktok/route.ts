import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { buildPacingCacheKey, getPacingCache } from "@/lib/pacing/pacingCache"
import { queryPacingFact } from "@/lib/snowflake/pacing-fact"
import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

type RequestBody = {
  mbaNumber?: string
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
}

const DEBUG =
  process.env.PACING_DEBUG === "true" ||
  process.env.DEBUG_PACING === "true" ||
  process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

const QUERY_ROW_LIMIT = 50000

async function readJsonBody(request: NextRequest): Promise<RequestBody> {
  const raw = await request.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as RequestBody
  } catch {
    throw new Error("Invalid JSON body")
  }
}

function normalizeDateString(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function buildDateRange(startDate?: string, endDate?: string) {
  // Use Melbourne yesterday as default end date since Snowflake data is typically up to yesterday
  const end = normalizeDateString(endDate) ?? getMelbourneYesterdayISO()
  // Clamp to 180 days to avoid unbounded scans that can time out serverless funcs.
  const maxRangeDays = 180
  const startProvided = normalizeDateString(startDate)
  const endDateObj = new Date(end)
  const earliestAllowed = new Date(endDateObj.getTime() - maxRangeDays * 24 * 60 * 60 * 1000)
  const start = (() => {
    if (!startProvided) return earliestAllowed.toISOString().slice(0, 10)
    const startObj = new Date(startProvided)
    if (startObj < earliestAllowed) return earliestAllowed.toISOString().slice(0, 10)
    return startProvided
  })()
  return { start, end }
}

export async function POST(request: NextRequest) {
  console.log("[PACING ROUTE HIT] social/tiktok", { time: new Date().toISOString() })
  const requestId = crypto.randomUUID()
  try {
    const body = await readJsonBody(request)
    const mbaNumber = body?.mbaNumber
    const rawLineItemIds = Array.isArray(body?.lineItemIds) ? body.lineItemIds.filter(Boolean) : []

    if (!mbaNumber) {
      return NextResponse.json({ error: "Missing mbaNumber" }, { status: 400 })
    }

    const normalizedLineItemIds = Array.from(
      new Set(
        rawLineItemIds
          .map((id) => String(id ?? "").trim().toLowerCase())
          .filter(Boolean)
      )
    )

    if (!normalizedLineItemIds.length) {
      return NextResponse.json({ error: "Missing lineItemIds" }, { status: 400 })
    }

    const { start, end } = buildDateRange(body.startDate, body.endDate)
    const originalCount = normalizedLineItemIds.length
    let lineItemIds = normalizedLineItemIds.slice(0, 500)
    if (originalCount > 500) {
      console.warn("[api/pacing/social/tiktok][" + requestId + "] ids truncated", {
        mbaNumber,
        originalCount,
        truncatedTo: 500,
      })
    }

    console.log("[api/pacing/social/tiktok][" + requestId + "] start", {
      mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIdsCount: lineItemIds?.length ?? 0,
    })

    const cacheKey = buildPacingCacheKey({
      scope: "pacing:tiktok",
      mba: mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIds,
    })

    const cacheResult = await getPacingCache(cacheKey, async () => {
      const t0 = Date.now()
      const rows = await queryPacingFact({
        channel: "tiktok",
        lineItemIds,
        startDate: start,
        endDate: end,
      })
      const t1 = Date.now()
      console.log("[api/pacing/social/tiktok][" + requestId + "] snowflake_ms", t1 - t0)

      // TEMPORARY DEBUG: Calculate max date and synced timestamp from results
      const dateDays = rows.map((r) => r.DATE_DAY).filter(Boolean)
      const maxDateDay = dateDays.length > 0 ? dateDays.sort().slice(-1)[0] : null
      const syncedAts = rows.map((r) => r.MAX_FIVETRAN_SYNCED_AT).filter(Boolean)
      const maxSyncedAt = syncedAts.length > 0 ? syncedAts.sort().slice(-1)[0] : null

      const hitRowLimit = rows.length === QUERY_ROW_LIMIT
      if (hitRowLimit) {
        console.warn("[api/pacing/social/tiktok] potential truncation: hit row limit", {
          mbaNumber,
          startDate: start,
          endDate: end,
          idsCount: lineItemIds.length,
          rowLimit: QUERY_ROW_LIMIT,
          rowsReturned: rows.length,
          maxDateDay,
        })
      }

      if (DEBUG) {
        console.info("[api/pacing/social/tiktok] rows", {
          mbaNumber,
          startDate: start,
          endDate: end,
          lineItemIds,
          rowCount: rows.length,
          maxDateDay,
          maxSyncedAt,
          hitRowLimit,
        })
      }

      return rows.map((row) => ({
        dateDay: row.DATE_DAY,
        adsetName: row.ENTITY_NAME ?? null,
        adsetId: row.ENTITY_ID ?? null,
        campaignName: row.CAMPAIGN_NAME ?? null,
        lineItemId: row.LINE_ITEM_ID ?? null,
        amountSpent: row.AMOUNT_SPENT ?? 0,
        impressions: row.IMPRESSIONS ?? 0,
        clicks: row.CLICKS ?? 0,
        results: row.RESULTS ?? 0,
        video3sViews: row.VIDEO_3S_VIEWS ?? 0,
        maxFivetranSyncedAt: row.MAX_FIVETRAN_SYNCED_AT ?? null,
        updatedAt: row.UPDATED_AT ?? null,
      }))
    })

    if (DEBUG && cacheResult.state === "STALE" && cacheResult.staleError) {
      console.warn("[api/pacing/social/tiktok] served stale cache", {
        mbaNumber,
        startDate: start,
        endDate: end,
        error: String(cacheResult.staleError),
      })
    }

    // TEMPORARY DEBUG: Add diagnostic fields to response
    // TODO: Remove these debug fields after verifying date range issues are resolved
    const dateDays = cacheResult.value.map((r) => r.dateDay).filter(Boolean)
    const maxDateDay = dateDays.length > 0 ? dateDays.sort().slice(-1)[0] : null
    const syncedAts = cacheResult.value.map((r) => r.maxFivetranSyncedAt).filter(Boolean)
    const maxSyncedAt = syncedAts.length > 0 ? syncedAts.sort().slice(-1)[0] : null
    
    const response = NextResponse.json({
      rows: cacheResult.value,
      count: cacheResult.value.length,
      // TEMPORARY DEBUG FIELDS - Remove after verification
      _debug: {
        object_name: "ASSEMBLEDVIEW.MART.PACING_FACT",
        max_date_day: maxDateDay,
        max_synced_at: maxSyncedAt,
        server_timestamp: new Date().toISOString(),
        query_date_range: { start, end },
        query_row_limit: QUERY_ROW_LIMIT,
        hit_row_limit: cacheResult.value.length === QUERY_ROW_LIMIT,
      },
    })
    // Ensure no caching
    response.headers.set("Cache-Control", "no-store, max-age=0")
    response.headers.set("x-pacing-cache", cacheResult.state)
    return response
  } catch (err: any) {
    console.error("[api/pacing/social/tiktok][" + requestId + "] error", err)
    const message = err?.message ?? String(err)

    return NextResponse.json(
      { error: "Failed to fetch TikTok pacing rows", message },
      { status: 500 }
    )
  }
}
