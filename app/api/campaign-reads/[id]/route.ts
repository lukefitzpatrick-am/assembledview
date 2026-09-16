import { NextRequest, NextResponse } from "next/server"

import { parseCampaignReadBeats, CampaignReadValidationError } from "@/lib/campaign-read/beats"
import {
  CampaignReadError,
  getCampaignReadById,
  updateCampaignReadBeats,
} from "@/lib/campaign-read/repo"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function actorEmail(session: { user?: { email?: string | null } } | null): string | null {
  const email = session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

function parseId(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    const status = auth.response.status === 401 ? 401 : 403
    return NextResponse.json(
      { error: status === 401 ? "unauthorised" : "forbidden" },
      { status },
    )
  }
  const email = actorEmail(auth.session)
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }

  const { id: rawId } = await context.params
  const id = parseId(rawId)
  if (id == null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const body = raw as Record<string, unknown>

  try {
    const existing = await getCampaignReadById(id)
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    const beats = parseCampaignReadBeats(body.beats)
    const item = await updateCampaignReadBeats({ id, beats, actorEmail: email })
    return NextResponse.json({ item })
  } catch (err) {
    if (err instanceof CampaignReadValidationError) {
      return NextResponse.json({ error: "validation", message: err.message }, { status: 400 })
    }
    if (err instanceof CampaignReadError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400
      return NextResponse.json({ error: err.code.toLowerCase(), message: err.message }, { status })
    }
    console.error("[api/campaign-reads/:id] PATCH failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
