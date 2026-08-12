import { NextRequest, NextResponse } from "next/server"

import {
  editCampaignInsight,
  WriteInsightError,
} from "@/lib/insights/writeCampaignInsights"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

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
  console.error("[api/insights/[id]] write failed", err)
  return NextResponse.json({ error: "internal_error" }, { status: 500 })
}

/**
 * PATCH /api/insights/[id] — edit in place (own + within window) or supersede.
 * There is no DELETE handler — wrong insights stay for audit.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
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

  const rawParams = await Promise.resolve(context.params)
  const id = Number(rawParams.id)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "validation", message: "Invalid insight id" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "validation", message: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await editCampaignInsight({
      id,
      actorEmail: email,
      body: typeof body.body === "string" ? body.body : undefined,
      insightType:
        typeof body.insightType === "string"
          ? body.insightType
          : typeof body.insight_type === "string"
            ? body.insight_type
            : undefined,
      period:
        body.period === null
          ? null
          : typeof body.period === "string"
            ? body.period
            : undefined,
      forceSupersede:
        body.forceSupersede === true ||
        body.force_supersede === true ||
        body.mode === "supersede",
    })
    return NextResponse.json({ item: result.row, mode: result.mode })
  } catch (err) {
    return writeErrorResponse(err)
  }
}
