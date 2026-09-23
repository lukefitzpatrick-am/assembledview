import { NextRequest, NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import type { CollisionDecision } from "@/lib/billing/collisionWorksheet"
import { writeCollisionDecisionEdits } from "@/lib/billing/writeCollisionAuditEdits.server"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DECISIONS = new Set<CollisionDecision>(["keep_shape_delta", "rescale", "recalc_auto"])
const MAX_CHOICES = 500

function parseChoices(raw: unknown): {
  lineItemId: string
  decision: CollisionDecision
  oldTotal: number
  newTotal: number
}[] | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { choices?: unknown }).choices)) {
    return null
  }
  const choices = (raw as { choices: unknown[] }).choices
  if (choices.length > MAX_CHOICES) return null
  const parsed: {
    lineItemId: string
    decision: CollisionDecision
    oldTotal: number
    newTotal: number
  }[] = []
  for (const row of choices) {
    if (!row || typeof row !== "object") return null
    const item = row as Record<string, unknown>
    const lineItemId = typeof item.lineItemId === "string" ? item.lineItemId.trim() : ""
    const decision = item.decision
    const oldTotal = typeof item.oldTotal === "number" ? item.oldTotal : Number(item.oldTotal)
    const newTotal = typeof item.newTotal === "number" ? item.newTotal : Number(item.newTotal)
    if (!lineItemId || typeof decision !== "string" || !DECISIONS.has(decision as CollisionDecision)) {
      return null
    }
    if (!Number.isFinite(oldTotal) || !Number.isFinite(newTotal)) return null
    parsed.push({
      lineItemId,
      decision: decision as CollisionDecision,
      oldTotal,
      newTotal,
    })
  }
  return parsed
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const currentUser = await getCurrentUser(request)
  if (!currentUser) {
    return NextResponse.json(
      { error: "no_user", message: "Could not resolve user for audit." },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }

  const choices = parseChoices(body)
  if (!choices) {
    return NextResponse.json(
      { error: "bad_request", message: "choices must be collision decisions with line totals." },
      { status: 400 }
    )
  }

  const written = await writeCollisionDecisionEdits(choices, {
    editedBy: currentUser.id,
    editedByName: currentUser.name || currentUser.email || "editor",
  })
  return NextResponse.json({ written })
}
