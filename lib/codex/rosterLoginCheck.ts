/**
 * Report-only: active roster emails that have never logged in via Auth0.
 * Compares against an existing Auth0 user list — no new Management API client.
 */

export type RosterLoginRow = {
  email: string
  active: boolean
}

export type Auth0LoginRow = {
  email?: string | null
  last_login?: string | null
  logins_count?: number | null
}

function hasLoggedIn(user: Auth0LoginRow): boolean {
  if (user.last_login && String(user.last_login).trim()) return true
  return Number(user.logins_count ?? 0) > 0
}

export function rosterEmailsNeverLoggedIn(
  roster: readonly RosterLoginRow[],
  auth0Users: readonly Auth0LoginRow[]
): string[] {
  const logged = new Set<string>()
  for (const user of auth0Users) {
    const email = String(user.email ?? "")
      .trim()
      .toLowerCase()
    if (!email || !hasLoggedIn(user)) continue
    logged.add(email)
  }
  const out: string[] = []
  for (const member of roster) {
    if (!member.active) continue
    const email = member.email.trim().toLowerCase()
    if (!email || logged.has(email)) continue
    out.push(email)
  }
  return out
}
