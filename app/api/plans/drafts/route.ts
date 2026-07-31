import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { isPlanDraftsEnabled } from "@/lib/mediaplan/drafts/flag"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"
import {
  deleteWorkingDraft,
  getWorkingDraft,
  listOtherWorkingDrafts,
  nudgeStaleDrafts,
  upsertWorkingDraft,
} from "@/lib/mediaplan/drafts/serverStore"

export const dynamic = "force-dynamic"

function userId(gate: unknown): { id: string; label: string } {
  const g = gate as {
    session?: { user?: { email?: string; name?: string; sub?: string } }
  }
  const email = g.session?.user?.email
  const sub = g.session?.user?.sub
  const id = String(email || sub || "unknown")
  const label = g.session?.user?.name || email || id
  return { id, label }
}

/** GET ?masterId= — own draft + other editors' open drafts. */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response
  if (!isPlanDraftsEnabled()) {
    return NextResponse.json({ enabled: false, draft: null, others: [] })
  }

  const url = new URL(request.url)
  if (url.searchParams.get("nudge") === "1") {
    const n = await nudgeStaleDrafts()
    return NextResponse.json({ enabled: true, nudged: n })
  }

  const masterId = Number(url.searchParams.get("masterId"))
  if (!Number.isFinite(masterId) || masterId <= 0) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const u = userId(gate)
  const [draft, others] = await Promise.all([
    getWorkingDraft({ masterId, userId: u.id }),
    listOtherWorkingDrafts({ masterId, excludeUserId: u.id }),
  ])
  return NextResponse.json({
    enabled: true,
    draft,
    others: others.map((o) => ({
      userId: o.userId,
      userLabel: o.userLabel,
      updatedAt: o.updatedAt,
      baseVersionId: o.baseVersionId,
    })),
  })
}

/** PUT — upsert server draft (tier 2). */
export async function PUT(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response
  if (!isPlanDraftsEnabled()) {
    return NextResponse.json({ error: "PLAN_DRAFTS off" }, { status: 409 })
  }

  const body = (await request.json()) as {
    masterId: number
    baseVersionId?: number | null
    state: PlanDraftStateV1
  }
  if (!body.masterId || !body.state) {
    return NextResponse.json({ error: "masterId and state required" }, { status: 400 })
  }
  const u = userId(gate)
  const row = await upsertWorkingDraft({
    masterId: Number(body.masterId),
    userId: u.id,
    userLabel: u.label,
    baseVersionId: body.baseVersionId ?? body.state.baseVersionId ?? null,
    state: body.state,
  })
  return NextResponse.json({ ok: true, draft: row })
}

/** DELETE — discard server draft. */
export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response
  if (!isPlanDraftsEnabled()) {
    return NextResponse.json({ ok: true, skipped: true })
  }
  const url = new URL(request.url)
  const masterId = Number(url.searchParams.get("masterId"))
  if (!Number.isFinite(masterId) || masterId <= 0) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const u = userId(gate)
  await deleteWorkingDraft({ masterId, userId: u.id })
  return NextResponse.json({ ok: true })
}
