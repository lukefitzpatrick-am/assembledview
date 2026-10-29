/**
 * Route gate for /api/finance/true-up/* (Stage 2 fixes): finance admin first,
 * then the flag (404), the audit user (401 no_user), then 0109 and 0106
 * (409 not_ready).
 */
import "server-only"

import { NextResponse, type NextRequest } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import type { RevisionActor } from "@/lib/data/publishBillingRevision"
import { requireFinanceAdmin } from "@/lib/requireRole"

import { trueUpActionsGate } from "./service"

export type TrueUpRouteGate = { response: NextResponse } | { sub: string; actor: RevisionActor }

export async function gateTrueUpRoute(request: NextRequest): Promise<TrueUpRouteGate> {
  const admin = await requireFinanceAdmin(request)
  if ("response" in admin) return { response: admin.response }
  const blocked = await trueUpActionsGate()
  if (blocked) {
    return {
      response: NextResponse.json(
        { error: blocked.status === 404 ? "not_found" : "not_ready", code: blocked.code, message: blocked.message },
        { status: blocked.status },
      ),
    }
  }
  const sub = String((admin.session?.user as { sub?: unknown } | undefined)?.sub ?? "").trim()
  const user = await getCurrentUser(request)
  if (!sub || !user || !hasResolvableAuditUserId(user.id)) {
    return {
      response: NextResponse.json({ error: "no_user", message: "Could not resolve user for audit." }, { status: 401 }),
    }
  }
  return { sub, actor: { teamMemberId: user.id, name: user.name ?? user.email ?? null, email: user.email ?? null } }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function serviceErrorResponse(e: { status: number; code: string; message: string } & Record<string, unknown>): NextResponse {
  return NextResponse.json(e, { status: e.status })
}
