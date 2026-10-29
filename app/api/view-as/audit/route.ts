import { NextRequest, NextResponse } from "next/server"

import { auth0Raw } from "@/lib/auth0"
import { getViewAsSecret, verifyViewAsToken, VIEW_AS_COOKIE } from "@/lib/auth/viewAs"
import { insertViewAsAuditSoft } from "@/lib/auth/viewAsAudit"
import { getUserRoles } from "@/lib/rbac"

export const dynamic = "force-dynamic"

/**
 * POST /api/view-as/audit — `blocked_write` rows. Called fire-and-forget by
 * middleware (edge, no DB) when it blocks a write in a client view, with the
 * browser's cookies forwarded. Writes only for a real admin whose signed
 * view-as cookie verifies for them. Always 204.
 */
export async function POST(request: NextRequest) {
  const raw = await auth0Raw.getSession(request)
  const roles = getUserRoles(raw?.user)
  if (!roles.includes("admin") || !raw?.user) {
    return new NextResponse(null, { status: 204 })
  }
  const secret = await getViewAsSecret()
  const token = request.cookies.get(VIEW_AS_COOKIE)?.value
  if (!secret || !token) return new NextResponse(null, { status: 204 })
  const verified = await verifyViewAsToken(token, secret, Date.now())
  const sub = typeof raw.user.sub === "string" ? raw.user.sub : ""
  if (!verified.ok || verified.payload.adminSub !== sub) return new NextResponse(null, { status: 204 })

  const body = (await request.json().catch(() => null)) as { path?: unknown; method?: unknown } | null
  await insertViewAsAuditSoft({
    action: "blocked_write",
    adminSub: sub,
    adminEmail: typeof raw.user.email === "string" ? raw.user.email : null,
    clientId: verified.payload.clientId,
    clientSlug: verified.payload.slug,
    path: typeof body?.path === "string" ? body.path : null,
    method: typeof body?.method === "string" ? body.method.toUpperCase() : null,
    userAgent: request.headers.get("user-agent"),
  })
  return new NextResponse(null, { status: 204 })
}
