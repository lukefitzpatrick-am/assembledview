import { NextRequest, NextResponse } from "next/server"
import { getCampaignPacingData } from "@/lib/snowflake/pacing-service"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

type RequestBody = {
  mbaNumber?: string
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
}

const DEBUG = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const QUERY_ROW_LIMIT = 50000

/**
 * Normalizes line item IDs: trims, lowercases, and deduplicates
 */
function normalizeLineItemIds(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return []
  const unique = new Set<string>()
  ids.forEach((id) => {
    const normalized = String(id ?? "").trim().toLowerCase()
    if (normalized) unique.add(normalized)
  })
  return Array.from(unique)
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: RequestBody
    try {
      body = await request.json()
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      )
    }

    // Validate mbaNumber
    const mbaNumber = body?.mbaNumber
    if (!mbaNumber || typeof mbaNumber !== "string" || !mbaNumber.trim()) {
      return NextResponse.json(
        { ok: false, error: "mbaNumber is required and must be a non-empty string" },
        { status: 400 }
      )
    }

    // Validate and normalize lineItemIds
    const rawLineItemIds = body?.lineItemIds
    const normalizedLineItemIds = normalizeLineItemIds(rawLineItemIds)
    if (normalizedLineItemIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "lineItemIds is required and must be a non-empty array" },
        { status: 400 }
      )
    }

    // Optional date parameters
    const startDate = body?.startDate
    const endDate = body?.endDate

    if (DEBUG) {
      console.log("[api/pacing/bulk] request", {
        mbaNumber,
        lineItemIdsCount: normalizedLineItemIds.length,
        startDate,
        endDate,
      })
    }

    // Fetch pacing data
    const rows = await getCampaignPacingData(
      mbaNumber,
      normalizedLineItemIds,
      startDate,
      endDate
    )

    const dateDays = rows.map((r) => r.dateDay).filter(Boolean)
    const maxDateDay = dateDays.length > 0 ? dateDays.sort().slice(-1)[0] : null
    const channelCounts = rows.reduce((acc, r) => {
      const ch = String((r as any)?.channel ?? "")
      acc[ch] = (acc[ch] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const hitRowLimit = rows.length === QUERY_ROW_LIMIT
    if (hitRowLimit) {
      console.warn("[api/pacing/bulk] potential truncation: hit row limit", {
        mbaNumber,
        rowLimit: QUERY_ROW_LIMIT,
        rowsReturned: rows.length,
        maxDateDay,
        channels: channelCounts,
        note: "If underlying Snowflake query is truncated, newest dates may be missing",
      })
    }

    if (DEBUG) {
      console.log("[api/pacing/bulk] response", {
        mbaNumber,
        rowCount: rows.length,
        maxDateDay,
        channels: channelCounts,
        hitRowLimit,
      })
    }

    // Return success response
    return NextResponse.json({
      ok: true,
      rows,
      count: rows.length,
      ...(DEBUG
        ? {
            _debug: {
              max_date_day: maxDateDay,
              server_timestamp: new Date().toISOString(),
              query_row_limit: QUERY_ROW_LIMIT,
              hit_row_limit: hitRowLimit,
              channels: channelCounts,
            },
          }
        : {}),
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorDetails = err instanceof Error ? err.stack : undefined

    if (DEBUG) {
      console.error("[api/pacing/bulk] error", {
        error: errorMessage,
        details: errorDetails,
      })
    }

    // Return server error response
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        ...(DEBUG && errorDetails ? { details: errorDetails } : {}),
      },
      { status: 500 }
    )
  }
}
