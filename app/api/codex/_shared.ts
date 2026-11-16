import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"
import { isCodexV2Enabled } from "@/lib/codex/flag"
import { isLockConflict, LOCK_CONFLICT_MESSAGE, safeErrorMessage } from "@/lib/codex/dbErrors"
import {
  CODEX_SHADOW_ROLES,
  userHasCodexShadowAccess,
} from "@/lib/codex/shadowRoles"
import { getUserRoles, type UserRole } from "@/lib/rbac"

/** Re-export for API consumers — source of truth is `lib/codex/shadowRoles.ts`. */
export { CODEX_SHADOW_ROLES }

export type CodexAuthOk = {
  session: NonNullable<Awaited<ReturnType<typeof auth0.getSession>>>
  roles: UserRole[]
}

export type CodexAuthResult = CodexAuthOk | { error: NextResponse }

/** 404 when Codex v2 flag is off — checked before auth (module invisible). */
export async function codexFlagGuard(): Promise<NextResponse | null> {
  if (!(await isCodexV2Enabled())) {
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
  if (!userHasCodexShadowAccess(roles)) {
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

/**
 * R1 (B43fix): a deadlock (40P01) or a lock that could not be taken (55P03)
 * is 409 `try_again`: the transaction rolled back whole, so a retry is safe.
 * Null for any other error.
 */
export function lockConflictResponse(error: unknown): NextResponse | null {
  if (!isLockConflict(error)) return null
  console.warn("[codex] write stopped by a lock conflict; answered 409 try_again", error)
  return jsonError(409, "try_again", LOCK_CONFLICT_MESSAGE)
}

/**
 * R1 (B43fix): a Codex write route's last catch. A lock conflict is 409
 * `try_again`; anything else is logged under `label` and answered 500
 * `{ error: title, message }`, where a database error's own text (SQL and
 * values) is replaced by a generic line.
 */
export function writeFailureResponse(error: unknown, label: string, title: string): NextResponse {
  const busy = lockConflictResponse(error)
  if (busy) return busy
  console.error(label, error)
  return NextResponse.json({ error: title, message: safeErrorMessage(error) }, { status: 500 })
}

/**
 * B42 (C-211): a task in a private project the viewer cannot see is
 * answered as missing (404 `not_found`, existence not confirmed) on every
 * single-task route. Call right after the staff gate. An id that is not a
 * positive whole number passes through (the route answers its own 400).
 * Before 0118 nothing is read (no private project can exist).
 */
export async function hiddenTaskGuard(
  context: { params: Promise<{ id: string }> },
  session: CodexAuthOk["session"]
): Promise<NextResponse | null> {
  const id = Number((await context.params).id)
  if (!Number.isSafeInteger(id) || id < 1) return null
  try {
    const { isTaskHiddenFrom } = await import("@/lib/codex/taskVisibility")
    const { db } = await import("@/db")
    if (await isTaskHiddenFrom(db, id, sessionEmail(session))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return null
  } catch (error) {
    console.error("[codex] task visibility check failed", error)
    return NextResponse.json({ error: "task_visibility_failed" }, { status: 500 })
  }
}

/** B42 (C-211): the first of `ids` in a private project the viewer cannot see, or null. */
export async function firstHiddenTaskId(
  ids: readonly number[],
  session: CodexAuthOk["session"]
): Promise<number | null> {
  const { hiddenTaskIds } = await import("@/lib/codex/taskVisibility")
  const { db } = await import("@/db")
  const hidden = await hiddenTaskIds(db, ids, sessionEmail(session))
  return ids.find((id) => hidden.has(id)) ?? null
}
