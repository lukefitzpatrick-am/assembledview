/**
 * One roster resolver for Codex (F16, B36). Pure: client-safe.
 *
 * Every place that turns an address, an @mention or an attendee email into a
 * team member goes through here:
 *   - resolveRosterAddress: an email (assignee writes, Ask for help, Fireflies
 *     attendees and action-item owners).
 *   - resolveRosterMention: a quick-add @token (email, local part, name).
 *
 * Rules:
 *   - The primary email always counts. Aliases (`team_members.email_aliases`)
 *     count when `aliases` is true (Fireflies always; Codex UI and API behind
 *     the `codex_roster_aliases` switch).
 *   - Inactive members (`active === false`) never match.
 *   - An address, alias or exact name held by two or more people is
 *     ambiguous. The resolver never picks one (C-58).
 *   - rosterDisplayName shows a readable name when the name field holds an
 *     email (Alex James's row) or is blank.
 */

export type RosterPerson = {
  email: string
  name: string
  aliases?: readonly string[] | null
  /** Omitted means active. */
  active?: boolean
}

export type RosterMatch<T> =
  | { kind: "unique"; member: T; via: "primary" | "alias" | "name" }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "none" }

export type RosterResolveOptions = {
  /** Count `email_aliases` as well as the primary email. */
  aliases: boolean
}

function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function isActive(person: RosterPerson): boolean {
  return person.active !== false
}

function localPart(email: string): string {
  const at = email.indexOf("@")
  return at > 0 ? email.slice(0, at) : ""
}

function mentionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Primary first, then aliases when counted. Lowercased, deduped, @-bearing only. */
function addressesOf(person: RosterPerson, opts: RosterResolveOptions): string[] {
  const out: string[] = []
  const add = (raw: unknown) => {
    const e = normaliseEmail(raw)
    if (e && e.includes("@") && !out.includes(e)) out.push(e)
  }
  add(person.email)
  if (opts.aliases) for (const a of person.aliases ?? []) add(a)
  return out
}

function settle<T>(hits: T[], via: "primary" | "alias" | "name", viaOf?: (m: T) => "primary" | "alias"): RosterMatch<T> {
  if (hits.length === 0) return { kind: "none" }
  if (hits.length > 1) return { kind: "ambiguous", candidates: hits }
  const member = hits[0]!
  return { kind: "unique", member, via: viaOf ? viaOf(member) : via }
}

/** An email to one active member, or ambiguous, or none. */
export function resolveRosterAddress<T extends RosterPerson>(
  email: string | null | undefined,
  roster: readonly T[],
  opts: RosterResolveOptions,
): RosterMatch<T> {
  const needle = normaliseEmail(email)
  if (!needle) return { kind: "none" }
  const hits = roster.filter((m) => isActive(m) && addressesOf(m, opts).includes(needle))
  return settle(hits, "primary", (m) => (normaliseEmail(m.email) === needle ? "primary" : "alias"))
}

export function looksLikeEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim())
}

/** `alex.james@x` → "Alex James"; `graduate@x` → "Graduate". Empty when no local part. */
export function displayNameFromEmail(email: string | null | undefined): string {
  const local = localPart(normaliseEmail(email)) || normaliseEmail(email)
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/**
 * The name to show for a person or an assignee snapshot. A real name shows as
 * stored. A name that is an email, or a blank name, shows a name built from
 * that email (or the primary email). Falls back to the email itself.
 */
export function rosterDisplayName(person: { name?: string | null; email?: string | null }): string {
  const name = String(person.name ?? "").trim()
  if (name && !looksLikeEmail(name)) return name
  const fromName = name ? displayNameFromEmail(name) : ""
  if (fromName) return fromName
  const fromEmail = displayNameFromEmail(person.email)
  return fromEmail || String(person.email ?? "").trim()
}

/**
 * A quick-add @token to a member. Stages, first stage with a hit wins:
 *   1. token is an email: resolveRosterAddress;
 *   2. local part of the primary email (or of an alias, when counted);
 *   3. exact display name (or the stored name);
 *   4. unique partial name match (several partial hits is no match, as before).
 * Two or more hits at stages 1 to 3 is ambiguous: no one is picked.
 */
export function resolveRosterMention<T extends RosterPerson>(
  token: string,
  roster: readonly T[],
  opts: RosterResolveOptions,
): RosterMatch<T> {
  const raw = token.trim().replace(/^@/, "")
  if (!raw) return { kind: "none" }
  if (raw.includes("@")) return resolveRosterAddress(raw, roster, opts)

  const lower = raw.toLowerCase()
  const key = mentionKey(raw)
  const active = roster.filter(isActive)

  const byLocal = active.filter((m) =>
    addressesOf(m, opts).some((address) => {
      const local = localPart(address)
      return local === lower || (key !== "" && mentionKey(local) === key)
    }),
  )
  if (byLocal.length > 0) {
    return settle(byLocal, "primary", (m) =>
      localPart(normaliseEmail(m.email)) === lower || mentionKey(localPart(normaliseEmail(m.email))) === key
        ? "primary"
        : "alias",
    )
  }

  if (key === "") return { kind: "none" }

  const byName = active.filter((m) => {
    const shown = rosterDisplayName(m)
    return (
      shown.toLowerCase() === lower ||
      mentionKey(shown) === key ||
      m.name.trim().toLowerCase() === lower
    )
  })
  if (byName.length > 0) return settle(byName, "name")

  const partial = active.filter((m) => {
    const shown = rosterDisplayName(m)
    return mentionKey(shown).includes(key) || mentionKey(m.name).includes(key)
  })
  return partial.length === 1 ? { kind: "unique", member: partial[0]!, via: "name" } : { kind: "none" }
}
