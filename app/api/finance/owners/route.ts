import { NextRequest, NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { parseFinanceOwnerUpdate } from "@/lib/finance/financeOwners"
import { readFinanceOwners, saveFinanceOwner } from "@/lib/finance/financeOwnersStore"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * FP-6 (D6). GET every client with its finance owner and the active team
 * members who can own one. PUT { client_id, team_member_id | null } sets or
 * clears one owner. Admin only (D5). Before migration 0105 is applied, GET
 * returns { ready: false } and PUT returns 409 not_ready.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  try {
    return NextResponse.json(await readFinanceOwners())
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load finance owners."
    return NextResponse.json({ error: "load_failed", message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Send JSON." }, { status: 400 })
  }
  const parsed = parseFinanceOwnerUpdate(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_body", message: parsed.message }, { status: 400 })
  }

  const user = await getCurrentUser(request)
  const actor = {
    id: user && hasResolvableAuditUserId(user.id) ? user.id : null,
    name: user?.name ?? user?.email ?? null,
  }

  try {
    const result = await saveFinanceOwner(parsed.value, actor)
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the finance owner."
    return NextResponse.json({ error: "save_failed", message }, { status: 500 })
  }
}
