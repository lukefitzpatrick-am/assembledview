import "server-only"
import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"
import { currentUserFromSession } from "@/lib/auth/teamMemberAuditId"

export type CurrentUser = {
  id: number
  name?: string | null
  email?: string | null
}

/**
 * Resolves the authenticated caller for audit fields from the Auth0 session.
 * Prefer `team_members.id` (lookup by `auth0_user_id` then lowercased email).
 * A numeric Xano `users_id` claim is a fallback only. When neither exists,
 * audit number fields default to 0 and the human identity is carried in the
 * *_name field via email, falling back to sub.
 */
export async function getCurrentUser(request: NextRequest | Request): Promise<CurrentUser | null> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) return null
  return currentUserFromSession(session.user as Record<string, unknown>)
}
