import { NextRequest, NextResponse } from "next/server"

import { auth0Raw } from "@/lib/auth0"
import {
  buildViewAsPayload,
  getViewAsSecret,
  isViewAsEnabled,
  normaliseViewAsMinutes,
  normaliseViewAsSlug,
  signViewAsPayload,
  viewAsCookieOptions,
  VIEW_AS_COOKIE,
  VIEW_AS_HINT_COOKIE,
  VIEW_AS_HINT_GRACE_SECONDS,
} from "@/lib/auth/viewAs"
import { insertViewAsAudit } from "@/lib/auth/viewAsAudit"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { getClientDisplayName } from "@/lib/clients/slug"
import { getUserRoles } from "@/lib/rbac"

export const dynamic = "force-dynamic"

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

/**
 * POST /api/admin/view-as — start a client view (admin only).
 * Body `{ slug, minutes }` (30, 60 or 120; default 60). Mode 1 only: client
 * level, `client_slugs = [slug]`, no `mba_numbers`.
 * Reads the REAL session (`auth0Raw`), so it cannot be started from inside a
 * client view (middleware also blocks this POST while a view is active).
 * Refuses unless the audit row is written (migration 0108).
 */
export async function POST(request: NextRequest) {
  const raw = await auth0Raw.getSession(request)
  if (!raw?.user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }
  const roles = getUserRoles(raw.user)
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (!isViewAsEnabled()) {
    return NextResponse.json(
      { error: "view_as_disabled", message: "View as client is switched off (VIEW_AS_ENABLED, plus APP_SIGNING_SECRET or VIEW_AS_SECRET)." },
      { status: 404 },
    )
  }
  const sub = typeof raw.user.sub === "string" ? raw.user.sub : ""
  if (!sub) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { slug?: unknown; minutes?: unknown } | null
  const slug = normaliseViewAsSlug(body?.slug)
  if (!slug) {
    return NextResponse.json({ error: "bad_slug" }, { status: 400 })
  }
  const minutes = normaliseViewAsMinutes(body?.minutes)

  const row = await fetchXanoClientRowByUrlSlug(slug)
  if (!row) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 })
  }
  const idRaw = Number(row.id)
  const clientId = Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null
  const clientName = getClientDisplayName(row) || slug

  try {
    await insertViewAsAudit({
      action: "start",
      adminSub: sub,
      adminEmail: typeof raw.user.email === "string" ? raw.user.email : null,
      clientId,
      clientSlug: slug,
      durationMinutes: minutes,
      path: "/api/admin/view-as",
      method: "POST",
      userAgent: request.headers.get("user-agent"),
    })
  } catch (err) {
    console.error("[view-as] start audit failed; not starting", err)
    return NextResponse.json(
      {
        error: "audit_unavailable",
        message: "Could not write the view-as audit row. Apply migration 0108 (view_as_audit) first.",
      },
      { status: 503 },
    )
  }

  const payload = buildViewAsPayload({ adminSub: sub, slug, clientId, clientName, minutes, nowMs: Date.now() })
  const secret = await getViewAsSecret()
  if (!secret) {
    return NextResponse.json(
      { error: "view_as_disabled", message: "View as client has no signing secret (APP_SIGNING_SECRET or VIEW_AS_SECRET)." },
      { status: 503 },
    )
  }
  const token = await signViewAsPayload(payload, secret)
  const response = NextResponse.json({
    redirect: `/dashboard/${encodeURIComponent(slug)}`,
    slug,
    clientName,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  })
  response.cookies.set(VIEW_AS_COOKIE, token, viewAsCookieOptions(minutes * 60))
  response.cookies.set(VIEW_AS_HINT_COOKIE, slug, viewAsCookieOptions(minutes * 60 + VIEW_AS_HINT_GRACE_SECONDS))
  response.headers.set("Cache-Control", "no-store")
  return response
}
