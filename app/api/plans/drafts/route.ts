import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { draftIdentity } from "@/lib/mediaplan/drafts/draftIdentity"
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

const IDENTITY_UNAVAILABLE =
  "Session identity unavailable — sign in again to use drafts"

function identityOr401(gate: unknown) {
  const ident = draftIdentity(gate)
  if (!ident) {
    return {
      error: NextResponse.json(
        { error: IDENTITY_UNAVAILABLE },
        { status: 401 }
      ),
    }
  }
  return { ident }
}

/**
 * GET ?masterId= — own draft + other editors' open drafts.
 * Stage 2b: persistence always on (offer on load). `enabled` still reports the
 * autosave flag for chrome.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const url = new URL(request.url)
  if (url.searchParams.get("nudge") === "1") {
    if (!isPlanDraftsEnabled()) {
      return NextResponse.json({ enabled: false, nudged: 0 })
    }
    const n = await nudgeStaleDrafts()
    return NextResponse.json({ enabled: true, nudged: n })
  }

  const masterId = Number(url.searchParams.get("masterId"))
  if (!Number.isFinite(masterId) || masterId <= 0) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const resolved = identityOr401(gate)
  if ("error" in resolved) return resolved.error
  const u = resolved.ident
  const [draft, others] = await Promise.all([
    getWorkingDraft({ masterId, userId: u.id }),
    listOtherWorkingDrafts({ masterId, excludeUserId: u.id }),
  ])
  return NextResponse.json({
    enabled: isPlanDraftsEnabled(),
    identity: { source: u.source, id: u.id },
    draft,
    others: others.map((o) => ({
      userId: o.userId,
      userLabel: o.userLabel,
      updatedAt: o.updatedAt,
      baseVersionId: o.baseVersionId,
    })),
  })
}

/** PUT — upsert server draft (Stage 2b working draft + PC7 tier 2). */
export async function PUT(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const body = (await request.json()) as {
    masterId: number
    baseVersionId?: number | null
    state: PlanDraftStateV1
  }
  if (!body.masterId || !body.state) {
    return NextResponse.json({ error: "masterId and state required" }, { status: 400 })
  }
  const resolved = identityOr401(gate)
  if ("error" in resolved) return resolved.error
  const u = resolved.ident
  const row = await upsertWorkingDraft({
    masterId: Number(body.masterId),
    userId: u.id,
    userLabel: u.label,
    baseVersionId: body.baseVersionId ?? body.state.baseVersionId ?? null,
    state: body.state,
  })
  return NextResponse.json({ ok: true, draft: row, enabled: isPlanDraftsEnabled() })
}

/** DELETE — discard server draft (must delete the row, not just hide the offer). */
export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response
  const url = new URL(request.url)
  const masterId = Number(url.searchParams.get("masterId"))
  if (!Number.isFinite(masterId) || masterId <= 0) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const resolved = identityOr401(gate)
  if ("error" in resolved) return resolved.error
  const u = resolved.ident
  await deleteWorkingDraft({ masterId, userId: u.id })
  return NextResponse.json({ ok: true })
}
