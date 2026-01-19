import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { buildPacingCacheKey, getPacingCache } from "@/lib/pacing/pacingCache"
import { queryPacingFact } from "@/lib/snowflake/pacing-fact"

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

async function readJsonBody(request: NextRequest): Promise<RequestBody> {
  const raw = await request.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as RequestBody
  } catch (err) {
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
  const today = new Date()
  const end = normalizeDateString(endDate) ?? today.toISOString().slice(0, 10)
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
  console.log("[PACING ROUTE HIT] social/meta", { time: new Date().toISOString() })
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
      console.warn("[api/pacing/social/meta][" + requestId + "] ids truncated", {
        mbaNumber,
        originalCount,
        truncatedTo: 500,
      })
    }

    console.log("[api/pacing/social/meta][" + requestId + "] start", {
      mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIdsCount: lineItemIds?.length ?? 0,
    })

    const cacheKey = buildPacingCacheKey({
      scope: "pacing:meta-social",
      mba: mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIds,
    })

    const cacheResult = await getPacingCache(cacheKey, async () => {
      const t0 = Date.now()
      const rows = await queryPacingFact({
        channel: "meta",
        lineItemIds,
        startDate: start,
        endDate: end,
      })
      const elapsedMs = Date.now() - t0
      console.log("[api/pacing/social/meta][" + requestId + "] snowflake_ms", elapsedMs)

      if (DEBUG) {
        console.info("[api/pacing/social/meta] rows", {
          mbaNumber,
          startDate: start,
          endDate: end,
          lineItemIds,
          rowCount: rows.length,
          elapsedMs,
        })
      }
      if (elapsedMs > 5000) {
        console.warn("[api/pacing/social/meta] slow query", {
          mbaNumber,
          rowCount: rows.length,
          elapsedMs,
        })
      }

      return rows.map((row) => ({
        dateDay: row.DATE_DAY,
        adsetName: row.ENTITY_NAME ?? null,
        adsetId: row.ENTITY_ID ?? null,
        campaignName: row.CAMPAIGN_NAME ?? null,
        amountSpent: row.AMOUNT_SPENT ?? 0,
        impressions: row.IMPRESSIONS ?? 0,
        clicks: row.CLICKS ?? 0,
        results: row.RESULTS ?? 0,
        video3sViews: row.VIDEO_3S_VIEWS ?? 0,
        lineItemId: row.LINE_ITEM_ID ?? null,
        maxFivetranSyncedAt: row.MAX_FIVETRAN_SYNCED_AT ?? null,
        updatedAt: row.UPDATED_AT ?? null,
      }))
    })

    if (DEBUG && cacheResult.state === "STALE" && cacheResult.staleError) {
      console.warn("[api/pacing/social/meta] served stale cache", {
        mbaNumber,
        startDate: start,
        endDate: end,
        error: String(cacheResult.staleError),
      })
    }

    const response = NextResponse.json({
      rows: cacheResult.value,
      count: cacheResult.value.length,
    })
    response.headers.set("x-pacing-cache", cacheResult.state)
    return response
  } catch (err: any) {
    console.error("[api/pacing/social/meta][" + requestId + "] error", err)
    const message = err?.message ?? String(err)

    return NextResponse.json(
      { error: "Failed to fetch Meta pacing rows", message },
      { status: 500 }
    )
  }
}
