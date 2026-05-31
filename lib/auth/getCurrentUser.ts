import "server-only"
import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"

export type CurrentUser = {
  id: number
  name?: string | null
  email?: string | null
}

function pickNumericUsersId(source: Record<string, unknown>): number | null {
  for (const key of ["users_id", "xano_users_id"]) {
    const n = Number(source[key])
    if (Number.isFinite(n) && n > 0) return n
  }
  const appMeta = source.app_metadata
  if (appMeta && typeof appMeta === "object") {
    const meta = appMeta as Record<string, unknown>
    const n = Number(meta.users_id ?? meta.xano_users_id)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * Resolves the authenticated caller for audit fields from the Auth0 session.
 * There is no Xano users table; identity is Auth0-only. A numeric users id is
 * not present on the session today, so audit number fields (edited_by /
 * billed_by) default to 0 and the human identity is carried in the *_name
 * field via email, falling back to sub. pickNumericUsersId is retained so a
 * numeric claim added later is picked up automatically.
 */
export async function getCurrentUser(request: NextRequest | Request): Promise<CurrentUser | null> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) return null
  const user = session.user as Record<string, unknown>

  const nameClaim = typeof user.name === "string" && user.name.trim() ? user.name.trim() : null
  const email = typeof user.email === "string" && user.email.trim() ? user.email.trim() : null
  const sub = typeof user.sub === "string" && user.sub.trim() ? user.sub.trim() : null

  const directId = pickNumericUsersId(user)
  return {
    id: directId ?? 0,
    name: nameClaim ?? email ?? sub,
    email,
  }
}
