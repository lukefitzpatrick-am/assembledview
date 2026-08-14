/**
 * Manual assign for Fireflies notes. One click updates that note only.
 * Client → client_domains (MR-5). Publisher → publisher_domains.
 * Internal / new_business → meeting_title_rules. No domain learning on those.
 * Matching other unattributed notes are counted (reattributed) but not written.
 */
import {
  attributeMeeting,
  extractEmailDomain,
} from "./attribution.js"
import { isLearnableExternalDomain } from "./learnableDomains.js"
import { normaliseAttributionText } from "./titleClients.js"
import type { TitleRuleTarget } from "./types.js"

export { assignSubmitForRow } from "./assignSubmit.js"

export type AssignNoteRow = {
  id: number
  title?: string | null
  clientId: number | null
  publisherId?: number | null
  attributedType?: string | null
  matchedBy: string | null
  participants: string | null
  isInternal: boolean
}

export type AssignTarget =
  | { type: "client"; clientId: number }
  | { type: "publisher"; publisherId: number }
  | { type: "internal" }
  | { type: "new_business" }

export type AssignNotePatch = {
  clientId?: number | null
  publisherId?: number | null
  attributedType: "client" | "publisher" | "internal" | "new_business"
  matchedBy: string
  isInternal: boolean
}

export type AssignDeps = {
  getNote: (id: number) => Promise<AssignNoteRow | null>
  updateNote: (id: number, patch: AssignNotePatch) => Promise<void>
  upsertClientDomain: (clientId: number, domain: string) => Promise<void>
  upsertPublisherDomain: (
    publisherId: number,
    domain: string
  ) => Promise<void>
  upsertTitleRule: (
    normalizedTitle: string,
    targetType: TitleRuleTarget,
    createdBy?: string | null
  ) => Promise<void>
  listUnattributed: () => Promise<AssignNoteRow[]>
  assembledDomains: Set<string>
  clientDomainSet: () => Set<string>
  createdBy?: string | null
}

function parseParticipants(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x))
    }
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function learnableDomainsFor(
  emails: string[],
  assembled: Set<string>,
  clientDomains?: Set<string>
): string[] {
  const out = new Set<string>()
  for (const email of emails) {
    const d = extractEmailDomain(email)
    if (
      d &&
      isLearnableExternalDomain(d, {
        assembledDomains: assembled,
        clientDomains,
      })
    ) {
      out.add(d)
    }
  }
  return [...out].sort()
}

export async function applyManualAssignment(
  input: { noteId: number; target: AssignTarget },
  deps: AssignDeps
): Promise<{ ok: true; reattributed: number } | { ok: false; error: string }> {
  const note = await deps.getNote(input.noteId)
  if (!note) return { ok: false, error: "not_found" }

  const emails = parseParticipants(note.participants)
  const target = input.target

  if (target.type === "client") {
    const domains = learnableDomainsFor(emails, deps.assembledDomains)
    for (const domain of domains) {
      await deps.upsertClientDomain(target.clientId, domain)
    }
    await deps.updateNote(input.noteId, {
      clientId: target.clientId,
      publisherId: null,
      attributedType: "client",
      matchedBy: "manual",
      isInternal: false,
    })
  } else if (target.type === "publisher") {
    const domains = learnableDomainsFor(
      emails,
      deps.assembledDomains,
      deps.clientDomainSet()
    )
    for (const domain of domains) {
      await deps.upsertPublisherDomain(target.publisherId, domain)
    }
    await deps.updateNote(input.noteId, {
      clientId: null,
      publisherId: target.publisherId,
      attributedType: "publisher",
      matchedBy: "manual",
      isInternal: false,
    })
  } else {
    const normalised = normaliseAttributionText(note.title ?? "")
    if (normalised) {
      await deps.upsertTitleRule(
        normalised,
        target.type,
        deps.createdBy ?? null
      )
    }
    await deps.updateNote(input.noteId, {
      clientId: null,
      publisherId: null,
      attributedType: target.type,
      matchedBy: "manual",
      isInternal: target.type === "internal",
    })
  }

  const domainToClient = new Map<string, number>()
  const domainToPublisher = new Map<string, number>()
  if (target.type === "client") {
    for (const d of learnableDomainsFor(emails, deps.assembledDomains)) {
      domainToClient.set(d, target.clientId)
    }
  }
  if (target.type === "publisher") {
    for (const d of learnableDomainsFor(
      emails,
      deps.assembledDomains,
      deps.clientDomainSet()
    )) {
      domainToPublisher.set(d, target.publisherId)
    }
  }
  const titleRules = new Map<string, TitleRuleTarget>()
  if (target.type === "internal" || target.type === "new_business") {
    const normalised = normaliseAttributionText(note.title ?? "")
    if (normalised) titleRules.set(normalised, target.type)
  }

  let reattributed = 0
  const others = await deps.listUnattributed()
  for (const row of others) {
    if (row.id === input.noteId) continue
    const result = attributeMeeting(
      {
        title: row.title ?? null,
        attendeeEmails: parseParticipants(row.participants),
      },
      {
        knownMbas: new Map(),
        domainToClient,
        domainToPublisher,
        titleRules,
        assembledDomains: deps.assembledDomains,
        titleClients: [],
      }
    )
    if (result.kind === "unattributed") continue
    if (target.type === "client" && result.kind !== "client") continue
    if (target.type === "publisher" && result.kind !== "publisher") continue
    if (target.type === "internal" && result.kind !== "internal") continue
    if (target.type === "new_business" && result.kind !== "new_business") {
      continue
    }
    reattributed += 1
  }

  return { ok: true, reattributed }
}
