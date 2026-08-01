import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"
import { isCodexV2Enabled } from "@/lib/codex/flag"
import { getUserRoles, type UserRole } from "@/lib/rbac"

/** Shadow phase: admin only. Managers join at team launch. */
export const CODEX_SHADOW_ROLES = ["admin"] as const

export type CodexAuthOk = {
  session: NonNullable<Awaited<ReturnType<typeof auth0.getSession>>>
  roles: UserRole[]
}

export type CodexAuthResult = CodexAuthOk | { error: NextResponse }

/** 404 when Codex v2 flag is off — checked before auth (module invisible). */
export function codexFlagGuard(): NextResponse | null {
  if (!isCodexV2Enabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return null
}

/**
 * Auth gate for Codex routes: require session; allow CODEX_SHADOW_ROLES only.
 * Client roles get 403.
 */
export async function requireCodexInternalAccess(
  request: Request
): Promise<CodexAuthResult> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const roles = getUserRoles(session.user)
  const isInternal = CODEX_SHADOW_ROLES.some((r) => roles.includes(r))

  if (!isInternal) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  }

  return { session, roles }
}

export function sessionEmail(
  session: CodexAuthOk["session"],
  fallback?: string | null
): string | null {
  const fromSession =
    typeof session.user?.email === "string" ? session.user.email.trim() : ""
  const email = fromSession || fallback?.trim() || ""
  return email ? email.toLowerCase() : null
}

export function jsonError(
  status: number,
  error: string,
  message?: string
): NextResponse {
  return NextResponse.json(
    message ? { error, message } : { error },
    { status }
  )
}
