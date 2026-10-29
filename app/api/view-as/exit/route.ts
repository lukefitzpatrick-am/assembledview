import { NextRequest, NextResponse } from "next/server"

import { auth0Raw } from "@/lib/auth0"
import {
  getViewAsSecret,
  normaliseViewAsSlug,
  verifyViewAsToken,
  viewAsClearCookies,
  VIEW_AS_COOKIE,
  VIEW_AS_HINT_COOKIE,
} from "@/lib/auth/viewAs"
import { insertViewAsAuditSoft } from "@/lib/auth/viewAsAudit"
import { getUserRoles } from "@/lib/rbac"

export const dynamic = "force-dynamic"

/**
 * POST /api/view-as/exit — end a client view. Always clears both cookies.
 * Reads the REAL session (`auth0Raw`). Audit (admin only, never blocks):
 * `exit` while the signed cookie is still valid; `expire` when it has gone
 * or lapsed but the hint cookie says a view was running (the ended page
 * calls this on load). On the middleware write allowlist.
 */
export async function POST(request: NextRequest) {
  const raw = await auth0Raw.getSession(request)
  const token = request.cookies.get(VIEW_AS_COOKIE)?.value ?? null
  const hintSlug = normaliseViewAsSlug(request.cookies.get(VIEW_AS_HINT_COOKIE)?.value)

  const roles = getUserRoles(raw?.user)
  const clear = (body: Record<string, unknown>) => {
    const response = NextResponse.json(body)
    for (const cookie of viewAsClearCookies()) response.cookies.set(cookie.name, cookie.value, cookie.options)
    response.headers.set("Cache-Control", "no-store")
    return response
  }
  if (!roles.includes("admin") || !raw?.user) {
    return clear({ redirect: "/" })
  }

  const secret = await getViewAsSecret()
  const now = Date.now()
  const live = token && secret ? await verifyViewAsToken(token, secret, now) : null
  const lapsed = token && secret && !live?.ok ? await verifyViewAsToken(token, secret, now, { allowExpired: true }) : null
  const sub = typeof raw.user.sub === "string" ? raw.user.sub : ""
  const payload =
    live?.ok && live.payload.adminSub === sub
      ? live.payload
      : lapsed?.ok && lapsed.payload.adminSub === sub
        ? lapsed.payload
        : null
  const slug = payload?.slug ?? hintSlug

  let action: "exit" | "expire" | null = null
  if (live?.ok && live.payload.adminSub === sub) action = "exit"
  else if (token || hintSlug) action = "expire"

  if (action && slug) {
    await insertViewAsAuditSoft({
      action,
      adminSub: sub,
      adminEmail: typeof raw.user.email === "string" ? raw.user.email : null,
      clientId: payload?.clientId ?? null,
      clientSlug: slug,
      path: "/api/view-as/exit",
      method: "POST",
      userAgent: request.headers.get("user-agent"),
    })
  }

  return clear({ redirect: slug ? `/client/${encodeURIComponent(slug)}` : "/client", action })
}
