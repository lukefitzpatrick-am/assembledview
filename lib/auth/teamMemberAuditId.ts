import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { teamMembers } from "@/db/schema"

/**
 * Finance/audit numeric actor. Prefer `team_members.id` over a session
 * `users_id` claim (wrong table). `0` is an explicit missing-id default,
 * not a failed lookup sentinel from Postgres.
 */
export function resolveAuditUserId(input: {
  claimedId: number | null
  teamMemberId: number | null
}): number {
  const team =
    input.teamMemberId != null && input.teamMemberId > 0 ? input.teamMemberId : null
  const claimed = input.claimedId != null && input.claimedId > 0 ? input.claimedId : null
  return team ?? claimed ?? 0
}

export function hasResolvableAuditUserId(id: number): boolean {
  return Number.isFinite(id) && id > 0
}

export type TeamMemberAuditLookup = (input: {
  auth0UserId: string | null
  email: string | null
}) => Promise<number | null>

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

export async function currentUserFromSession(
  user: Record<string, unknown>,
  lookupTeamMemberId: TeamMemberAuditLookup = lookupTeamMemberAuditId
): Promise<{ id: number; name: string | null; email: string | null }> {
  const nameClaim = typeof user.name === "string" && user.name.trim() ? user.name.trim() : null
  const email = typeof user.email === "string" && user.email.trim() ? user.email.trim() : null
  const sub = typeof user.sub === "string" && user.sub.trim() ? user.sub.trim() : null

  const teamMemberId = await lookupTeamMemberId({ auth0UserId: sub, email })
  const claimedId = pickNumericUsersId(user)
  return {
    id: resolveAuditUserId({ claimedId, teamMemberId }),
    name: nameClaim ?? email ?? sub,
    email,
  }
}

export async function lookupTeamMemberAuditId(input: {
  auth0UserId: string | null
  email: string | null
}): Promise<number | null> {
  const db = getDb()
  const auth0UserId = input.auth0UserId?.trim() || null
  const email = input.email?.trim().toLowerCase() || null

  if (auth0UserId) {
    const [byAuth0] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.auth0UserId, auth0UserId))
      .limit(1)
    if (byAuth0?.id && byAuth0.id > 0) return byAuth0.id
  }

  if (email) {
    const [byEmail] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(sql`lower(${teamMembers.email}) = ${email}`)
      .limit(1)
    if (byEmail?.id && byEmail.id > 0) return byEmail.id
  }

  return null
}
