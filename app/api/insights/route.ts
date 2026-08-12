import { NextRequest, NextResponse } from "next/server"

import {
  listCampaignInsights,
  type ListCampaignInsightsFilters,
} from "@/lib/insights/queryCampaignInsights"
import {
  createCampaignInsight,
  WriteInsightError,
} from "@/lib/insights/writeCampaignInsights"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.floor(n)
}

function actorEmail(auth: { session: { user?: { email?: string | null } } | null }): string | null {
  const email = auth.session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

function writeErrorResponse(err: unknown): NextResponse {
  if (err instanceof WriteInsightError) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "FORBIDDEN"
          ? 403
          : err.code === "CYCLE" || err.code === "ALREADY_SUPERSEDED" || err.code === "CONFLICT"
            ? 409
            : 400
    return NextResponse.json({ error: err.code.toLowerCase(), message: err.message }, { status })
  }
  console.error("[api/insights] write failed", err)
  return NextResponse.json({ error: "internal_error" }, { status: 500 })
}

/**
 * GET /api/insights — admin-only insight library.
 * Client-role tokens get 403 (not an empty list). Middleware only authenticates.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    const status = auth.response.status === 401 ? 401 : 403
    return NextResponse.json(
      { error: status === 401 ? "unauthorised" : "forbidden" },
      { status },
    )
  }

  const sp = request.nextUrl.searchParams
  const filters: ListCampaignInsightsFilters = {
    q: sp.get("q")?.trim() || undefined,
    clientId: parsePositiveInt(sp.get("clientId") ?? sp.get("client_id")),
    mbaNumber: sp.get("mba")?.trim() || sp.get("mbaNumber")?.trim() || undefined,
    period: sp.get("period")?.trim() || undefined,
    insightType: sp.get("insightType")?.trim() || sp.get("insight_type")?.trim() || undefined,
    source: sp.get("source")?.trim() || undefined,
    includeSuperseded:
      sp.get("includeSuperseded") === "1" ||
      sp.get("includeSuperseded") === "true" ||
      sp.get("showSuperseded") === "1" ||
      sp.get("showSuperseded") === "true",
    limit: parsePositiveInt(sp.get("limit")) ?? 50,
  }

  try {
    const items = await listCampaignInsights(filters)
    return NextResponse.json({ items, count: items.length })
  } catch (err) {
    console.error("[api/insights] list failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

/**
 * POST /api/insights — create a human insight (optional supersedesId).
 * Never deletes. source is always `human`; created_by is the session actor.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    const status = auth.response.status === 401 ? 401 : 403
    return NextResponse.json(
      { error: status === 401 ? "unauthorised" : "forbidden" },
      { status },
    )
  }

  const email = actorEmail(auth)
  if (!email) {
    return NextResponse.json(
      { error: "unauthorised", message: "Session email required" },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "validation", message: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const row = await createCampaignInsight({
      clientId:
        typeof body.clientId === "number"
          ? body.clientId
          : typeof body.client_id === "number"
            ? body.client_id
            : body.clientId != null
              ? Number(body.clientId)
              : body.client_id != null
                ? Number(body.client_id)
                : null,
      mbaNumber:
        typeof body.mbaNumber === "string"
          ? body.mbaNumber
          : typeof body.mba_number === "string"
            ? body.mba_number
            : typeof body.mba === "string"
              ? body.mba
              : null,
      body: typeof body.body === "string" ? body.body : "",
      insightType:
        typeof body.insightType === "string"
          ? body.insightType
          : typeof body.insight_type === "string"
            ? body.insight_type
            : "",
      period:
        body.period === null
          ? null
          : typeof body.period === "string"
            ? body.period
            : undefined,
      createdBy: email,
      supersedesId:
        typeof body.supersedesId === "number"
          ? body.supersedesId
          : typeof body.supersedes_id === "number"
            ? body.supersedes_id
            : body.supersedesId != null
              ? Number(body.supersedesId)
              : body.supersedes_id != null
                ? Number(body.supersedes_id)
                : null,
    })
    return NextResponse.json({ item: row }, { status: 201 })
  } catch (err) {
    return writeErrorResponse(err)
  }
}
