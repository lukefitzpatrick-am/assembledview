import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import {
  getPortfolioPacingData,
  type PortfolioPacingInput,
} from "@/lib/snowflake/portfolio-pacing-service"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
export const maxDuration = 60

/** JSON body and response mirror {@link getPortfolioPacingData} (daily + totals include conversions and revenue). */

type RequestBody = {
  lineItemIds?: string[]
  startDate?: string
  endDate?: string
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

  const input: PortfolioPacingInput = {
    lineItemIds: ids,
    startDate: start,
    endDate: end,
  }

  let cacheHit = false
  const payload = await getPortfolioPacingData(input, {
    requestId,
    startedAtMs: t0,
    onCacheHit: () => {
      cacheHit = true
    },
  })

  const response = NextResponse.json(payload)
  if (!cacheHit) {
    response.headers.set("Cache-Control", "no-store, max-age=0")
  }

  return response
}
