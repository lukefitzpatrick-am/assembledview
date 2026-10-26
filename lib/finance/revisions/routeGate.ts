/**
 * Route gate for /api/finance/billing-revisions/*:
 * flag off -> 404, then admin (401/403), then the audit user (401 no_user),
 * then the 0106 marker (409 not_ready).
 */
import "server-only"

import { NextResponse, type NextRequest } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import type { RevisionActor } from "@/lib/data/publishBillingRevision"
import { requireFinanceAdmin } from "@/lib/requireRole"

import { BILLING_REVISIONS_NOT_READY_MESSAGE, isBillingRevisionsEnabled } from "./flag"
import { isBillingRevisionsMigrationApplied } from "./marker"

export type RevisionRouteGate = { response: NextResponse } | { sub: string; actor: RevisionActor }

export async function gateBillingRevisionRoute(request: NextRequest): Promise<RevisionRouteGate> {
  if (!isBillingRevisionsEnabled()) {
    return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) }
  }
  const admin = await requireFinanceAdmin(request)
  if ("response" in admin) return { response: admin.response }
  const sub = String((admin.session?.user as { sub?: unknown } | undefined)?.sub ?? "").trim()
  const user = await getCurrentUser(request)
  if (!sub || !user || !hasResolvableAuditUserId(user.id)) {
    return {
      response: NextResponse.json(
        { error: "no_user", message: "Could not resolve user for audit." },
        { status: 401 },
      ),
    }
  }
  if (!(await isBillingRevisionsMigrationApplied())) {
    return {
      response: NextResponse.json(
        { error: "not_ready", code: "NOT_READY", message: BILLING_REVISIONS_NOT_READY_MESSAGE },
        { status: 409 },
      ),
    }
  }
  return { sub, actor: { teamMemberId: user.id, name: user.name ?? user.email ?? null, email: user.email ?? null } }
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
