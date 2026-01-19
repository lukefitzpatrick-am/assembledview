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

function buildDateSeries(startISO?: string | null, endISO?: string | null) {
  if (!startISO || !endISO) return []
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

async function readJsonBody(request: NextRequest): Promise<RequestBody> {
  const raw = await request.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as RequestBody
  } catch (err) {
    throw new Error("Invalid JSON body")
  }
}

export async function POST(request: NextRequest) {
  console.log("[PACING ROUTE HIT] programmatic/video", { time: new Date().toISOString() })
  const requestId = crypto.randomUUID()
  try {
    const body = await readJsonBody(request)
    const mbaNumber = body?.mbaNumber
    const rawLineItemIds = Array.isArray(body?.lineItemIds)
      ? body.lineItemIds.filter(Boolean).map((id) => String(id))
      : []

    if (!mbaNumber) {
      return NextResponse.json({ error: "Missing mbaNumber" }, { status: 400 })
    }

    const normalizedLineItemIds = Array.from(
      new Set(rawLineItemIds.map((id) => id.trim().toLowerCase()).filter(Boolean))
    )
    if (!normalizedLineItemIds.length) {
      return NextResponse.json({ error: "Missing lineItemIds" }, { status: 400 })
    }

    const { start, end } = buildDateRange(body.startDate, body.endDate)
    const originalCount = normalizedLineItemIds.length
    let lineItemIds = normalizedLineItemIds.slice(0, 500)
    if (originalCount > 500) {
      console.warn("[api/pacing/programmatic/video][" + requestId + "] ids truncated", {
        mbaNumber,
        originalCount,
        truncatedTo: 500,
      })
    }

    console.log("[api/pacing/programmatic/video][" + requestId + "] start", {
      mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIdsCount: lineItemIds?.length ?? 0,
    })

    const cacheKey = buildPacingCacheKey({
      scope: "pacing:programmatic-video",
      mba: mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIds,
    })

    const cacheResult = await getPacingCache(cacheKey, async () => {
      const t0 = Date.now()
      const rows = await queryPacingFact({
        channel: "programmatic-video",
        lineItemIds,
        startDate: start,
        endDate: end,
      })
      const t1 = Date.now()
      console.log("[api/pacing/programmatic/video][" + requestId + "] snowflake_ms", t1 - t0)

      if (DEBUG) {
        console.info("[api/pacing/programmatic/video] rows", {
          mbaNumber,
          startDate: start,
          endDate: end,
          lineItemIds,
          rowCount: rows.length,
        })
      }

      const mappedRows = rows.map((row) => ({
        date: row.DATE_DAY,
        lineItem: row.ENTITY_NAME ?? null,
        insertionOrder: row.CAMPAIGN_NAME ?? null,
        spend: Number(row.AMOUNT_SPENT ?? 0),
        impressions: Number(row.IMPRESSIONS ?? 0),
        clicks: Number(row.CLICKS ?? 0),
        conversions: Number(row.RESULTS ?? 0),
        matchedPostfix: row.LINE_ITEM_ID ? String(row.LINE_ITEM_ID).toLowerCase() : null,
        lineItemId: row.LINE_ITEM_ID ?? null,
      }))

      const totals = mappedRows.reduce(
        (acc, row) => ({
          spend: acc.spend + (row.spend ?? 0),
          impressions: acc.impressions + (row.impressions ?? 0),
          clicks: acc.clicks + (row.clicks ?? 0),
          conversions: acc.conversions + (row.conversions ?? 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
      )

      const dateSeries = buildDateSeries(start, end)

      return { rows: mappedRows, totals, dateSeries }
    })

    if (DEBUG && cacheResult.state === "STALE" && cacheResult.staleError) {
      console.warn("[api/pacing/programmatic/video] served stale cache", {
        mbaNumber,
        startDate: start,
        endDate: end,
        error: String(cacheResult.staleError),
      })
    }

    const pacing = cacheResult.value
    const response = NextResponse.json({
      rows: pacing.rows,
      totals: pacing.totals,
      dateSeries: pacing.dateSeries,
      count: pacing.rows.length,
    })
    response.headers.set("x-pacing-cache", cacheResult.state)
    return response
  } catch (err: any) {
    console.error("[api/pacing/programmatic/video][" + requestId + "] error", err)
    const message = err?.message ?? String(err)

    if (err?.code === 405501 || err?.sqlState === "08002") {
      return NextResponse.json(
        { error: "Snowflake busy", message, retryable: true },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch DV360 Video pacing rows", message },
      { status: 500 }
    )
  }
}
