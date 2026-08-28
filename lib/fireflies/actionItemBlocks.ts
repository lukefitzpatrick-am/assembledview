/**
 * Fireflies action_items arrive as per-person blocks headed **Full Name**.
 */
import {
  resolveRosterEmailResult,
  type TeamMemberIdentity,
} from "./rosterAliases.js"

export type RosterPerson = {
  email: string
  name: string
  aliases?: string[]
}

export type ParsedActionLine = {
  line: string
  timestamp: string | null
}

export type PersonBlock = {
  name: string
  items: ParsedActionLine[]
}

export type BlockResolution =
  | { kind: "unique"; member: RosterPerson }
  | { kind: "unassigned" }
  | { kind: "ambiguous"; members: RosterPerson[] }
  | { kind: "unknown" }

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/
const HEADER_RE = /^\*{2}\s*(.+?)\s*\*{2}\s*:?\s*$/
const HTML_HEADER_RE = /^<(?:strong|b)>\s*(.+?)\s*<\/(?:strong|b)>\s*:?\s*$/i
const TIMESTAMP_RE = /\((\d{1,2}:\d{2}(?::\d{2})?)\)/
const SECTION_RE = /^(action items?|todos?|next steps?)\s*:?$/i

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
}

function toIdentity(person: RosterPerson): TeamMemberIdentity {
  return {
    canonicalEmail: person.email.trim().toLowerCase(),
    name: person.name,
    aliases: person.aliases,
  }
}

export function displayNameFromEmailLocal(email: string): string {
  const local = (email.split("@")[0] ?? "").trim()
  if (!local) return ""
  return local
    .split(/[._+\-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function headerName(line: string): string | null {
  const md = line.match(HEADER_RE)
  if (md?.[1]) return md[1].trim()
  const html = line.match(HTML_HEADER_RE)
  if (html?.[1]) return html[1].trim()
  return null
}

function timestampOf(line: string): string | null {
  const m = line.match(TIMESTAMP_RE)
  return m?.[1] ?? null
}

export function parsePersonBlocks(raw: string | null | undefined): PersonBlock[] {
  if (!raw?.trim()) return []
  const text = stripHtml(raw)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET_RE, "").trim())
    .filter((l) => l.length > 0)
    .filter((l) => !SECTION_RE.test(l))

  const blocks: PersonBlock[] = []
  let current: PersonBlock | null = null

  const startBlock = (name: string) => {
    current = { name, items: [] }
    blocks.push(current)
  }

  for (const line of lines) {
    const header = headerName(line)
    if (header) {
      startBlock(header)
      continue
    }
    if (!current) {
      startBlock("Unassigned")
    }
    current!.items.push({
      line,
      timestamp: timestampOf(line),
    })
  }

  return blocks.filter((b) => b.items.length > 0 || b.name.length > 0)
}

function exactNameHits(name: string, roster: RosterPerson[]): RosterPerson[] {
  const needle = name.trim().toLowerCase()
  if (!needle) return []
  return roster.filter((m) => m.name.trim().toLowerCase() === needle)
}

export function resolveBlockAssignee(
  blockName: string,
  roster: RosterPerson[],
  attendeeEmails: string[] = []
): BlockResolution {
  const name = blockName.trim()
  if (!name || /^unassigned$/i.test(name)) {
    return { kind: "unassigned" }
  }

  const nameHits = exactNameHits(name, roster)
  if (nameHits.length === 1) return { kind: "unique", member: nameHits[0]! }
  if (nameHits.length > 1) {
    return { kind: "ambiguous", members: nameHits }
  }

  const derivedHits: RosterPerson[] = []
  const seen = new Set<string>()
  const identities = roster.map(toIdentity)
  const needle = name.toLowerCase()
  for (const email of attendeeEmails) {
    const resolved = resolveRosterEmailResult(email, identities)
    const candidates =
      resolved.kind === "unique"
        ? [resolved.member]
        : resolved.kind === "ambiguous"
          ? resolved.members
          : []
    for (const member of candidates) {
      const person = roster.find(
        (r) => r.email.trim().toLowerCase() === member.canonicalEmail
      )
      if (!person) continue
      const derivedNames = [
        displayNameFromEmailLocal(person.email),
        ...(person.aliases ?? []).map(displayNameFromEmailLocal),
        displayNameFromEmailLocal(email),
      ]
      const matchesDerived = derivedNames.some(
        (d) => d.trim().toLowerCase() === needle
      )
      if (!matchesDerived) continue
      if (seen.has(person.email.trim().toLowerCase())) continue
      seen.add(person.email.trim().toLowerCase())
      derivedHits.push(person)
    }
  }
  if (derivedHits.length === 1) {
    return { kind: "unique", member: derivedHits[0]! }
  }
  if (derivedHits.length > 1) {
    return { kind: "ambiguous", members: derivedHits }
  }

  return { kind: "unknown" }
}
