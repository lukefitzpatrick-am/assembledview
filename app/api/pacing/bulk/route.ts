import { NextRequest, NextResponse } from "next/server"
import { getCampaignPacingData } from "@/lib/snowflake/pacing-service"
import { getSearchPacingData, type SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
// NOTE: Vercel functions default to 15s; pacing can exceed this during cold warehouse resume.
// Increase max duration to prevent Runtime Timeout Error (504).
export const maxDuration = 60

type RequestBody = {
  mbaNumber?: string
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
  includeSearch?: boolean
  searchLineItemIds?: string[]
  searchStartDate?: string
  searchEndDate?: string
}

const DEBUG = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"
const QUERY_ROW_LIMIT = 50000
const INTERNAL_TIMEOUT_MS = 55_000

function createRequestId(): string {
  // short, log-friendly id
  return Math.random().toString(36).slice(2, 10)
}

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
  const requestId = createRequestId()
  const t0 = Date.now()

  try {
    console.info("[api/pacing/bulk] start", { requestId })

    // Parse request body
    let body: RequestBody
    try {
      body = await request.json()
    } catch (err) {
      console.info("[api/pacing/bulk] timing", { requestId, stage: "parse_json", ms: Date.now() - t0 })
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      )
    }

    // Validate mbaNumber
    const mbaNumber = body?.mbaNumber
    if (!mbaNumber || typeof mbaNumber !== "string" || !mbaNumber.trim()) {
      console.info("[api/pacing/bulk] timing", { requestId, stage: "validate", ms: Date.now() - t0 })
      return NextResponse.json(
        { ok: false, error: "mbaNumber is required and must be a non-empty string" },
        { status: 400 }
      )
    }

    // Validate and normalize lineItemIds
    const rawLineItemIds = body?.lineItemIds
    const normalizedLineItemIds = normalizeLineItemIds(rawLineItemIds)
    // Note: we allow empty lineItemIds when includeSearch is true (search-only pacing).

    // Optional date parameters
    const startDate = body?.startDate
    const endDate = body?.endDate
    const includeSearch = body?.includeSearch === true
    const searchLineItemIds = Array.isArray(body?.searchLineItemIds) ? body.searchLineItemIds : []
    const searchStartDate = body?.searchStartDate
    const searchEndDate = body?.searchEndDate

    console.info("[api/pacing/bulk] timing", { requestId, stage: "parsed_validated", ms: Date.now() - t0 })

    if (DEBUG) {
      console.log("[api/pacing/bulk] request", {
        mbaNumber,
        lineItemIdsCount: normalizedLineItemIds.length,
        startDate,
        endDate,
        includeSearch,
        searchLineItemIdsCount: searchLineItemIds.length,
        searchStartDate,
        searchEndDate,
      })
    }

    // If we're not returning any bulk rows, only allow the request when Search pacing was explicitly requested.
    if (normalizedLineItemIds.length === 0 && !includeSearch) {
      return NextResponse.json(
        { ok: false, error: "lineItemIds is required and must be a non-empty array" },
        { status: 400 }
      )
    }

    // Fetch pacing data (bulk rows + optional search payload)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), INTERNAL_TIMEOUT_MS)

    let rows: Awaited<ReturnType<typeof getCampaignPacingData>>
    let search: SearchPacingResponse | null = null
    try {
      const rowsPromise =
        normalizedLineItemIds.length > 0
          ? getCampaignPacingData(
              mbaNumber,
              normalizedLineItemIds,
              { startDate, endDate },
              {
                requestId,
                signal: ac.signal,
              }
            )
          : Promise.resolve([])

      const searchPromise = includeSearch
        ? getSearchPacingData({
            lineItemIds: searchLineItemIds,
            startDate: searchStartDate ?? startDate,
            endDate: searchEndDate ?? endDate,
            requestId,
            signal: ac.signal,
          }).catch((err) => {
            const message = err instanceof Error ? err.message : String(err)
            return {
              totals: { cost: 0, clicks: 0, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: null },
              daily: [],
              lineItems: [],
              keywords: [],
              error: message || "Search pacing failed",
            } satisfies SearchPacingResponse
          })
        : Promise.resolve(null)

      const results = await Promise.all([rowsPromise, searchPromise])
      rows = results[0]
      search = results[1]
    } catch (err) {
      const isAbortError = Boolean(err && typeof err === "object" && (err as any).name === "AbortError")
      if (isAbortError || ac.signal.aborted) {
        console.warn("[api/pacing/bulk] timeout", { requestId, ms: Date.now() - t0 })
        return NextResponse.json({ ok: false, error: "Timed out" }, { status: 504 })
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    console.info("[api/pacing/bulk] timing", { requestId, stage: "snowflake_done", ms: Date.now() - t0 })

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
        note: "If underlying Snowflake query is truncated, oldest dates may be missing",
      })
    }

    if (DEBUG) {
      console.log("[api/pacing/bulk] response", {
        mbaNumber,
        rowCount: rows.length,
        maxDateDay,
        channels: channelCounts,
        hitRowLimit,
        includeSearch,
        searchOk: includeSearch ? Boolean(search && !search.error) : undefined,
      })
    }

    // Return success response
    console.info("[api/pacing/bulk] timing", { requestId, stage: "respond", ms: Date.now() - t0 })
    return NextResponse.json({
      ok: true,
      rows,
      count: rows.length,
      ...(includeSearch ? { search } : {}),
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

    console.error("[api/pacing/bulk] error", { requestId, ms: Date.now() - t0, error: errorMessage })

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
        // Always return JSON on errors; keep message generic unless DEBUG is enabled.
        error: "Internal server error",
        ...(DEBUG && errorDetails ? { details: errorDetails } : {}),
      },
      { status: 500 }
    )
  }
}
