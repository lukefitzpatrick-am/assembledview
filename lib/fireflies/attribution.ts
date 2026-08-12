/**
 * Deterministic Fireflies attribution (title MBA → domain → internal → queue).
 */
import type { AttributionContext, AttributionResult } from "./types.js"

/** Separators aligned with Xero matchMba tokeniser. */
const TOKEN_RE = /[^\s/,;|\-\[\]]+/g
const BRACKET_MBA_RE = /\[([A-Za-z0-9]+)\]/

export const DEFAULT_ASSEMBLED_DOMAINS = [
  "assembledmedia.com.au",
  "assembledmedia.com",
  "assembled.media",
  "assembledview.com.au",
] as const

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at < 0 || at === trimmed.length - 1) return null
  const domain = trimmed.slice(at + 1).trim()
  return domain || null
}

export function isAssembledDomain(
  domain: string,
  assembled: Set<string>
): boolean {
  return assembled.has(domain.trim().toLowerCase())
}

function tokenizeTitle(title: string): string[] {
  return title.match(TOKEN_RE) ?? []
}

function matchTitleMba(
  title: string,
  knownMbas: Map<string, { mbaNumber: string; clientId: number | null }>
): { mbaNumber: string; clientId: number | null } | null {
  const bracket = title.match(BRACKET_MBA_RE)
  if (bracket?.[1]) {
    const hit = knownMbas.get(bracket[1].toLowerCase())
    if (hit) return hit
  }

  const tokens = tokenizeTitle(title)
  const hits: Array<{ mbaNumber: string; clientId: number | null }> = []
  const seen = new Set<string>()
  for (const t of tokens) {
    const key = t.toLowerCase()
    const hit = knownMbas.get(key)
    if (hit && !seen.has(hit.mbaNumber.toLowerCase())) {
      seen.add(hit.mbaNumber.toLowerCase())
      hits.push(hit)
    }
  }
  if (hits.length === 1) return hits[0]!
  return null
}

/**
 * Attribution order: (1) title MBA (2) external attendee domain (3) all-assembled → internal (4) queue.
 */
export function attributeMeeting(
  input: { title: string | null | undefined; attendeeEmails: string[] },
  ctx: AttributionContext
): AttributionResult {
  const title = input.title ?? ""
  const titleHit = matchTitleMba(title, ctx.knownMbas)
  if (titleHit) {
    return {
      kind: "campaign",
      mbaNumber: titleHit.mbaNumber,
      clientId: titleHit.clientId,
      matchedBy: "title",
      isInternal: false,
    }
  }

  const domains = new Set<string>()
  for (const email of input.attendeeEmails) {
    const d = extractEmailDomain(email)
    if (d) domains.add(d)
  }

  if (domains.size === 0) {
    return {
      kind: "unattributed",
      mbaNumber: null,
      clientId: null,
      matchedBy: null,
      isInternal: false,
    }
  }

  const external = [...domains].filter(
    (d) => !isAssembledDomain(d, ctx.assembledDomains)
  )

  if (external.length === 0) {
    return {
      kind: "internal",
      mbaNumber: null,
      clientId: null,
      matchedBy: "internal",
      isInternal: true,
    }
  }

  const clientIds = new Set<number>()
  for (const d of external) {
    const cid = ctx.domainToClient.get(d)
    if (cid != null) clientIds.add(cid)
  }

  if (clientIds.size === 1) {
    return {
      kind: "client",
      mbaNumber: null,
      clientId: [...clientIds][0]!,
      matchedBy: "domain",
      isInternal: false,
    }
  }

  return {
    kind: "unattributed",
    mbaNumber: null,
    clientId: null,
    matchedBy: null,
    isInternal: false,
  }
}

/** Domains from attendee emails excluding assembled (for MR-5 learn-on-assign). */
export function externalDomainsFromEmails(
  emails: string[],
  assembled: Set<string>
): string[] {
  const out = new Set<string>()
  for (const email of emails) {
    const d = extractEmailDomain(email)
    if (d && !isAssembledDomain(d, assembled)) out.add(d)
  }
  return [...out].sort()
}
