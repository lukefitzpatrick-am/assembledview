/**
 * Deterministic Fireflies attribution.
 *
 * CLIENT BEATS PUBLISHER — if a meeting matches both a client signal
 * (title or client_domains) and a publisher domain, it is a client meeting.
 *
 * Order: client title → client domain → publisher domain → meeting_title_rules
 * → roster-only internal → queue. MBA refines client mba_number only.
 */
import { resolveRosterEmailResult } from "./rosterAliases.js"
import {
  matchTitleClients,
  normaliseAttributionText,
} from "./titleClients.js"
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

function refineMba(
  title: string,
  clientId: number,
  ctx: AttributionContext
): string | null {
  const mba = matchTitleMba(title, ctx.knownMbas)
  if (!mba) return null
  if (mba.clientId != null && mba.clientId === clientId) return mba.mbaNumber
  return null
}

function isInternalOnly(
  attendeeEmails: string[],
  ctx: AttributionContext
): boolean {
  if (attendeeEmails.length === 0) return false
  const roster = ctx.roster ?? []
  for (const email of attendeeEmails) {
    const domain = extractEmailDomain(email)
    if (domain && isAssembledDomain(domain, ctx.assembledDomains)) continue
    if (roster.length > 0) {
      const resolved = resolveRosterEmailResult(email, roster)
      if (resolved.kind !== "none") continue
    }
    return false
  }
  return true
}

function uniqueExternalDomains(
  attendeeEmails: string[],
  assembled: Set<string>
): string[] {
  const domains = new Set<string>()
  for (const email of attendeeEmails) {
    const d = extractEmailDomain(email)
    if (d) domains.add(d)
  }
  return [...domains].filter((d) => !isAssembledDomain(d, assembled))
}

/**
 * Attribution order: (1) client name in title (2) client attendee domain
 * (3) publisher domain (4) meeting_title_rules (5) all-internal (6) queue.
 * MBA token refines mba_number only after a client is chosen.
 */
export function attributeMeeting(
  input: { title: string | null | undefined; attendeeEmails: string[] },
  ctx: AttributionContext
): AttributionResult {
  const title = input.title ?? ""
  const titleHits = matchTitleClients(title, ctx.titleClients ?? [])

  if (titleHits.length === 1) {
    const hit = titleHits[0]!
    return {
      kind: "client",
      mbaNumber: refineMba(title, hit.clientId, ctx),
      clientId: hit.clientId,
      publisherId: null,
      matchedBy: "title",
      isInternal: false,
    }
  }

  if (titleHits.length > 1) {
    return {
      kind: "unattributed",
      mbaNumber: null,
      clientId: null,
      publisherId: null,
      matchedBy: null,
      isInternal: false,
      candidates: titleHits.map((h) => ({
        clientId: h.clientId,
        name: h.displayName,
      })),
    }
  }

  const external = uniqueExternalDomains(
    input.attendeeEmails,
    ctx.assembledDomains
  )

  const clientIds = new Set<number>()
  for (const d of external) {
    const cid = ctx.domainToClient.get(d)
    if (cid != null) clientIds.add(cid)
  }

  if (clientIds.size === 1) {
    const clientId = [...clientIds][0]!
    return {
      kind: "client",
      mbaNumber: refineMba(title, clientId, ctx),
      clientId,
      publisherId: null,
      matchedBy: "domain",
      isInternal: false,
    }
  }

  const publisherIds = new Set<number>()
  const domainToPublisher = ctx.domainToPublisher ?? new Map()
  for (const d of external) {
    const pid = domainToPublisher.get(d)
    if (pid != null) publisherIds.add(pid)
  }

  if (publisherIds.size === 1) {
    return {
      kind: "publisher",
      mbaNumber: null,
      clientId: null,
      publisherId: [...publisherIds][0]!,
      matchedBy: "publisher_domain",
      isInternal: false,
    }
  }

  const normalised = normaliseAttributionText(title)
  const titleRule = normalised ? ctx.titleRules?.get(normalised) : undefined
  if (titleRule === "internal") {
    return {
      kind: "internal",
      mbaNumber: null,
      clientId: null,
      publisherId: null,
      matchedBy: "title_rule",
      isInternal: true,
    }
  }
  if (titleRule === "new_business") {
    return {
      kind: "new_business",
      mbaNumber: null,
      clientId: null,
      publisherId: null,
      matchedBy: "title_rule",
      isInternal: false,
    }
  }

  if (isInternalOnly(input.attendeeEmails, ctx)) {
    return {
      kind: "internal",
      mbaNumber: null,
      clientId: null,
      publisherId: null,
      matchedBy: "internal",
      isInternal: true,
    }
  }

  return {
    kind: "unattributed",
    mbaNumber: null,
    clientId: null,
    publisherId: null,
    matchedBy: null,
    isInternal: false,
    candidates: [],
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
