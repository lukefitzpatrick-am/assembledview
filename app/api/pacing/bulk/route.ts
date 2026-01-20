import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { buildPacingCacheKey, getPacingCache } from "@/lib/pacing/pacingCache"
import { getCampaignPacingData, type PacingRow } from "@/lib/snowflake/pacing-service"

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

const MAX_RANGE_DAYS = 180
const MAX_IDS = 500

function normalizeDateString(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed.toISOString().slice(0, 10)
}

function clampDateRange(startDate?: string, endDate?: string) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const end = normalizeDateString(endDate) ?? todayISO
  const endDateObj = new Date(end)
  const earliestAllowed = new Date(endDateObj.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
  const startProvided = normalizeDateString(startDate)
  const start =
    startProvided && startProvided >= earliestAllowed.toISOString().slice(0, 10)
      ? startProvided
      : earliestAllowed.toISOString().slice(0, 10)

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

function normalizeIds(ids?: string[]) {
  if (!Array.isArray(ids)) return []
  const unique = new Set<string>()
  ids.forEach((id) => {
    const normalized = String(id ?? "").trim().toLowerCase()
    if (normalized) unique.add(normalized)
  })
  return Array.from(unique)
}

function summariseByChannel(rows: PacingRow[]) {
  return rows.reduce<Record<string, { spend: number; impressions: number; clicks: number; results: number; video3sViews: number }>>(
    (acc, row) => {
      const key = row.channel
      if (!acc[key]) {
        acc[key] = { spend: 0, impressions: 0, clicks: 0, results: 0, video3sViews: 0 }
      }
      acc[key].spend += row.amountSpent ?? 0
      acc[key].impressions += row.impressions ?? 0
      acc[key].clicks += row.clicks ?? 0
      acc[key].results += row.results ?? 0
      acc[key].video3sViews += row.video3sViews ?? 0
      return acc
    },
    {}
  )
}

export async function POST(request: NextRequest) {
  console.log("[PACING ROUTE HIT] pacing/bulk", { time: new Date().toISOString() })
  const requestId = crypto.randomUUID()
  try {
    const body = await readJsonBody(request)
    const mbaNumber = body?.mbaNumber
    const rawLineItemIds = Array.isArray(body?.lineItemIds) ? body.lineItemIds : []

    if (!mbaNumber) {
      return NextResponse.json({ error: "Missing mbaNumber" }, { status: 400 })
    }

    const normalizedLineItemIds = normalizeIds(rawLineItemIds)
    if (!normalizedLineItemIds.length) {
      return NextResponse.json({ error: "Missing lineItemIds" }, { status: 400 })
    }
  if (normalizedLineItemIds.length > 100) {
    console.warn("[api/pacing/bulk][" + requestId + "] large lineItemIds", {
      mbaNumber,
      count: normalizedLineItemIds.length,
    })
  }

    const { start, end } = clampDateRange(body.startDate, body.endDate)
    const originalCount = normalizedLineItemIds.length
    let lineItemIds = normalizedLineItemIds.slice(0, MAX_IDS)
    if (originalCount > MAX_IDS) {
      console.warn("[api/pacing/bulk][" + requestId + "] ids truncated", {
        mbaNumber,
        originalCount,
        truncatedTo: MAX_IDS,
      })
    }

    console.log("[api/pacing/bulk][" + requestId + "] start", {
      mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIdsCount: lineItemIds.length,
    })

    const cacheKey = buildPacingCacheKey({
      scope: "pacing:bulk",
      mba: mbaNumber,
      startDate: start,
      endDate: end,
      lineItemIds,
    })

    const cacheResult = await getPacingCache(cacheKey, async () => {
      const t0 = Date.now()
      const rows = await getCampaignPacingData(mbaNumber, lineItemIds, start, end)
      const elapsedMs = Date.now() - t0
      console.log("[api/pacing/bulk][" + requestId + "] snowflake_ms", elapsedMs, {
        rowCount: rows.length,
      })
      return rows
    })

    if (DEBUG && cacheResult.state === "STALE" && cacheResult.staleError) {
      console.warn("[api/pacing/bulk] served stale cache", {
        mbaNumber,
        startDate: start,
        endDate: end,
        error: String(cacheResult.staleError),
      })
    }

    const rows = cacheResult.value
    const response = NextResponse.json({
      rows,
      totalsByChannel: summariseByChannel(rows),
      dateSeries: buildDateSeries(start, end),
      count: rows.length,
    })
    response.headers.set("x-pacing-cache", cacheResult.state)
    return response
  } catch (err: any) {
    console.error("[api/pacing/bulk][" + requestId + "] error", err)
    const message = err?.message ?? String(err)

    if (err?.code === 405501 || err?.sqlState === "08002") {
      return NextResponse.json({ error: "Snowflake busy", message, retryable: true }, { status: 503 })
    }

    return NextResponse.json({ error: "Failed to fetch pacing rows", message }, { status: 500 })
  }
}
