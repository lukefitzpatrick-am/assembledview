import type { NextRequest, NextResponse } from "next/server"

import { getUserRoles } from "@/lib/rbac"
import { requirePacingAccess, type PacingSession } from "@/lib/pacing/pacingAuth"
import { pacingJsonError } from "@/lib/pacing/pacingHttp"

export type RelabelAccessOk = {
  ok: true
  session: PacingSession
  actorEmail: string
}

export type RelabelAccessDenied = { ok: false; response: NextResponse }

/**
 * Staff who can open /pacing (authenticated, not a client-role user).
 * Not requireAdmin — assembled team members with no client role are allowed.
 */
export async function requireRelabelAccess(
  request: NextRequest,
): Promise<RelabelAccessOk | RelabelAccessDenied> {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate

  const roles = getUserRoles(gate.session.user)
  if (roles.includes("client")) {
    return { ok: false, response: pacingJsonError("forbidden", 403) }
  }

  const email =
    typeof gate.session.user?.email === "string" ? gate.session.user.email.trim().toLowerCase() : ""
  if (!email) {
    return { ok: false, response: pacingJsonError("unauthorised", 401) }
  }

  return { ok: true, session: gate.session, actorEmail: email }
}
