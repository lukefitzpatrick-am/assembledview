/**
 * Comment @mentions (B41). Pure: client-safe, no database.
 *
 * The server parses every comment body itself and stores what resolved in
 * `task_comments.mentions` as `[{ email, name, token }]`. A `mentions` key sent
 * by the browser is never read. Each token goes through the one roster
 * resolver (`resolveRosterMention`, B36): email, local part, display name or a
 * unique partial name; aliases count only when `codex_roster_aliases` is on.
 *
 * - A token held by two or more people (ambiguous) or by no one (unknown)
 *   stays plain text and the author is told.
 * - On a private project, a person who cannot see the project is not
 *   mentioned (stays plain text, the author is told, nobody is notified).
 * - The body is stored exactly as typed. Chips are drawn by matching the
 *   stored tokens against the body again (`mentionSegments`).
 */
import { resolveRosterMention, rosterDisplayName, type RosterPerson } from "./rosterResolve"

export type CommentMention = {
  /** The person's primary email, lower case. */
  email: string
  /** Display name at the time of the comment. */
  name: string
  /** The token as typed, with its @ (for drawing the chip). */
  token: string
}

export type UnresolvedMentionReason = "ambiguous" | "unknown" | "no_access"

export type UnresolvedMention = {
  token: string
  reason: UnresolvedMentionReason
  /** People the token matched, for ambiguous. */
  count?: number
  /** The person, for no_access. */
  name?: string
}

/** At most this many distinct @tokens are looked at in one comment. */
export const MENTION_TOKENS_MAX = 20

/**
 * `@` at the start or after a space or opening bracket, then a run of
 * name-ish characters, optionally a whole email. `ask@me` inside a word is not
 * a mention (the @ must follow a boundary).
 */
const MENTION_RE = /(^|[\s([{,;:])(@[A-Za-z0-9][A-Za-z0-9._%+'-]*(?:@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)?)/g

/** Trailing sentence punctuation is not part of the token (`@mia.` is `@mia`). */
function trimToken(raw: string): string {
  return raw.replace(/[._%+'-]+$/, "")
}

export type MentionToken = { token: string; start: number; end: number }

/** Every @token in the body, in order (duplicates kept, with positions). */
export function findMentionTokens(body: string): MentionToken[] {
  const out: MentionToken[] = []
  const text = String(body ?? "")
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(text)) !== null) {
    const token = trimToken(m[2]!)
    if (token.length < 2) continue
    const start = m.index + m[1]!.length
    out.push({ token, start, end: start + token.length })
  }
  return out
}

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Active people whose shown or stored name contains the token (for the message only). */
function partialNameHits(token: string, roster: readonly RosterPerson[]): number {
  const key = nameKey(token.replace(/^@/, ""))
  if (!key || token.slice(1).includes("@")) return 0
  return roster.filter((m) => m.active !== false && (nameKey(rosterDisplayName(m)).includes(key) || nameKey(m.name).includes(key))).length
}

function tokenKey(token: string): string {
  return token.toLowerCase()
}

export type ResolveMentionsOptions = {
  /** Count `team_members.email_aliases` (the `codex_roster_aliases` switch). */
  aliases: boolean
  /** Can this person see the task's project? Omitted: everyone can (no project or a public one). */
  canSee?: (email: string) => boolean
}

export type ResolvedMentions = {
  mentions: CommentMention[]
  unresolved: UnresolvedMention[]
}

/**
 * The mentions a comment stores and the tokens it leaves as text. One entry
 * per person (the first token that named them) and one per unresolved token.
 */
export function resolveCommentMentions<T extends RosterPerson>(
  body: string,
  roster: readonly T[],
  opts: ResolveMentionsOptions,
): ResolvedMentions {
  const mentions: CommentMention[] = []
  const unresolved: UnresolvedMention[] = []
  const seenTokens = new Set<string>()
  const seenEmails = new Set<string>()
  for (const { token } of findMentionTokens(body)) {
    const key = tokenKey(token)
    if (seenTokens.has(key)) continue
    seenTokens.add(key)
    if (seenTokens.size > MENTION_TOKENS_MAX) break
    const match = resolveRosterMention(token, roster, { aliases: opts.aliases })
    if (match.kind === "ambiguous") {
      unresolved.push({ token, reason: "ambiguous", count: match.candidates.length })
      continue
    }
    if (match.kind === "none") {
      // The resolver gives no one for several partial name hits (as quick-add
      // does); say so instead of "not on the team list".
      const partial = partialNameHits(token, roster)
      unresolved.push(partial > 1 ? { token, reason: "ambiguous", count: partial } : { token, reason: "unknown" })
      continue
    }
    const email = match.member.email.trim().toLowerCase()
    const name = rosterDisplayName(match.member)
    if (opts.canSee && !opts.canSee(email)) {
      unresolved.push({ token, reason: "no_access", name })
      continue
    }
    if (seenEmails.has(email)) continue
    seenEmails.add(email)
    mentions.push({ email, name, token })
  }
  return { mentions, unresolved }
}

/** One line for the author about each token that stayed plain text. */
export function unresolvedMentionMessage(u: UnresolvedMention): string {
  if (u.reason === "ambiguous") {
    return `${u.token} matches ${u.count ?? 2} people, so it stays as text. Use their email or full name.`
  }
  if (u.reason === "no_access") {
    return `${u.name ?? u.token} cannot see this private project, so ${u.token} stays as text and they are not notified.`
  }
  return `${u.token} is not on the team list, so it stays as text.`
}

/** Read `task_comments.mentions` defensively (older rows hold `[]`). */
export function readStoredMentions(value: unknown): CommentMention[] {
  if (!Array.isArray(value)) return []
  const out: CommentMention[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : ""
    if (!email.includes("@")) continue
    out.push({
      email,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : email,
      token: typeof r.token === "string" ? r.token : "",
    })
  }
  return out
}

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; email: string; name: string }

/**
 * The body split into text and mention chips. A token is a chip only when
 * the stored mentions name it, so an unresolved @word stays text.
 */
export function mentionSegments(body: string, mentions: readonly CommentMention[]): MentionSegment[] {
  const text = String(body ?? "")
  const byToken = new Map<string, CommentMention>()
  for (const m of mentions) if (m.token) byToken.set(tokenKey(m.token), m)
  const out: MentionSegment[] = []
  let at = 0
  for (const t of findMentionTokens(text)) {
    const hit = byToken.get(tokenKey(t.token))
    if (!hit) continue
    if (t.start > at) out.push({ kind: "text", text: text.slice(at, t.start) })
    out.push({ kind: "mention", text: t.token, email: hit.email, name: hit.name })
    at = t.end
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) })
  return out
}
