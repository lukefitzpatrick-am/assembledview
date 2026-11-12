import { resolveRosterAddress } from "../codex/rosterResolve.js"

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

export type RosterEmailResolution =
  | { kind: "unique"; member: TeamMemberIdentity }
  | { kind: "ambiguous"; members: TeamMemberIdentity[] }
  | { kind: "none" }

/**
 * Delegates to the one Codex resolver (`lib/codex/rosterResolve.ts`, F16):
 * canonical or alias, ambiguous when two people hold the address.
 */
export function resolveRosterEmailResult(
  email: string,
  roster: readonly TeamMemberIdentity[]
): RosterEmailResolution {
  const people = roster.map((member) => ({
    member,
    email: member.canonicalEmail,
    name: member.name,
    aliases: member.aliases ?? [],
  }))
  const result = resolveRosterAddress(email, people, { aliases: true })
  if (result.kind === "unique") return { kind: "unique", member: result.member.member }
  if (result.kind === "ambiguous") {
    return { kind: "ambiguous", members: result.candidates.map((c) => c.member) }
  }
  return { kind: "none" }
}

/** Unique match only. Multi-match returns null — never first-row wins. */
export function resolveRosterEmail(
  email: string,
  roster: readonly TeamMemberIdentity[]
): TeamMemberIdentity | null {
  const result = resolveRosterEmailResult(email, roster)
  return result.kind === "unique" ? result.member : null
}

/** Roster attendees only — one identity per person. Ambiguous emails are omitted. */
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
