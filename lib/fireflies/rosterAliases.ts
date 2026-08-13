/**
 * Team-member email alias resolver.
 * Short forms (luke@) and canonical (luke.fitzpatrick@) are the same person.
 */

export type TeamMemberIdentity = {
  canonicalEmail: string
  name: string
  aliases?: string[]
}

export function parseEmailAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const email = String(raw ?? "").trim().toLowerCase()
    if (!email || !email.includes("@") || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export function memberEmailSet(member: TeamMemberIdentity): Set<string> {
  const set = new Set<string>()
  const canonical = member.canonicalEmail.trim().toLowerCase()
  if (canonical) set.add(canonical)
  for (const alias of member.aliases ?? []) {
    const e = alias.trim().toLowerCase()
    if (e) set.add(e)
  }
  return set
}

export function resolveRosterEmail(
  email: string,
  roster: readonly TeamMemberIdentity[]
): TeamMemberIdentity | null {
  const needle = email.trim().toLowerCase()
  if (!needle) return null
  for (const member of roster) {
    if (memberEmailSet(member).has(needle)) return member
  }
  return null
}

/** Roster attendees only — one identity per person. */
export function uniquePeopleFromEmails(
  emails: readonly string[],
  roster: readonly TeamMemberIdentity[]
): TeamMemberIdentity[] {
  const seen = new Set<string>()
  const out: TeamMemberIdentity[] = []
  for (const email of emails) {
    const member = resolveRosterEmail(email, roster)
    if (!member) continue
    if (seen.has(member.canonicalEmail)) continue
    seen.add(member.canonicalEmail)
    out.push(member)
  }
  return out
}
