import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { draftIdentity } from "@/lib/mediaplan/drafts/draftIdentity"
import {
  deletePlanPresence,
  listOtherPlanPresence,
  upsertPlanPresence,
} from "@/lib/mediaplan/drafts/presenceStore"
import type { PlanPresencePage } from "@/lib/mediaplan/drafts/presence"

export const dynamic = "force-dynamic"

const IDENTITY_UNAVAILABLE =
  "Session identity unavailable — sign in again to use presence"

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

function parseMasterId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function parsePage(raw: unknown): PlanPresencePage {
  return raw === "create" ? "create" : "edit"
}

/**
 * GET ?masterId= — everyone else with last_seen_at within 90s.
 * Names ride `userLabel`; never invent identity (SF-2). Presence is not a lock.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const url = new URL(request.url)
  const masterId = parseMasterId(url.searchParams.get("masterId"))
  if (masterId == null) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const resolved = identityOr401(gate)
  if ("error" in resolved) return resolved.error
  const others = await listOtherPlanPresence({
    masterId,
    excludeUserId: resolved.ident.id,
  })
  return NextResponse.json({ others })
}

/**
 * POST { masterId, leaving? } — upsert last_seen_at, or delete when leaving.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const body = (await request.json().catch(() => ({}))) as {
    masterId?: unknown
    leaving?: unknown
    page?: unknown
  }
  const masterId = parseMasterId(body.masterId)
  if (masterId == null) {
    return NextResponse.json({ error: "masterId required" }, { status: 400 })
  }
  const resolved = identityOr401(gate)
  if ("error" in resolved) return resolved.error
  const u = resolved.ident

  if (body.leaving === true) {
    await deletePlanPresence({ masterId, userId: u.id })
    return NextResponse.json({ ok: true })
  }

  await upsertPlanPresence({
    masterId,
    userId: u.id,
    userLabel: u.label,
    page: parsePage(body.page),
  })
  const others = await listOtherPlanPresence({
    masterId,
    excludeUserId: u.id,
  })
  return NextResponse.json({ ok: true, others })
}
