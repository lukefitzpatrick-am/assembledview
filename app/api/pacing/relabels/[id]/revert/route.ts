import { NextRequest, NextResponse } from "next/server"

import { requireRelabelAccess } from "@/lib/pacing/relabel/auth"
import { runRelabelRevert } from "@/lib/pacing/relabel/handlers"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireRelabelAccess(request)
  if (!gate.ok) return gate.response

  const { id: raw } = await context.params
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  return runRelabelRevert(id, gate.actorEmail)
}
