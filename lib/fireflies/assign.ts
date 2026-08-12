/**
 * Manual assign for unattributed Fireflies notes — writes client_domains (MR-5 learn).
 */
import {
  attributeMeeting,
  externalDomainsFromEmails,
} from "./attribution.js"

export type AssignNoteRow = {
  id: number
  clientId: number | null
  matchedBy: string | null
  participants: string | null
  isInternal: boolean
}

export type AssignDeps = {
  getNote: (id: number) => Promise<AssignNoteRow | null>
  updateNoteClient: (
    id: number,
    clientId: number,
    matchedBy: "manual" | "domain"
  ) => Promise<void>
  upsertClientDomain: (clientId: number, domain: string) => Promise<void>
  listUnattributed: () => Promise<AssignNoteRow[]>
  assembledDomains: Set<string>
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

export async function applyManualAssignment(
  input: { noteId: number; clientId: number },
  deps: AssignDeps
): Promise<{ ok: true; reattributed: number } | { ok: false; error: string }> {
  const note = await deps.getNote(input.noteId)
  if (!note) return { ok: false, error: "not_found" }
  if (note.isInternal) return { ok: false, error: "internal_note" }

  const emails = parseParticipants(note.participants)
  const domains = externalDomainsFromEmails(emails, deps.assembledDomains)

  for (const domain of domains) {
    await deps.upsertClientDomain(input.clientId, domain)
  }

  await deps.updateNoteClient(input.noteId, input.clientId, "manual")

  const domainToClient = new Map<string, number>()
  for (const d of domains) domainToClient.set(d, input.clientId)

  let reattributed = 0
  const others = await deps.listUnattributed()
  for (const row of others) {
    if (row.id === input.noteId) continue
    const result = attributeMeeting(
      {
        title: null,
        attendeeEmails: parseParticipants(row.participants),
      },
      {
        knownMbas: new Map(),
        domainToClient,
        assembledDomains: deps.assembledDomains,
      }
    )
    if (result.kind === "client" && result.clientId === input.clientId) {
      await deps.updateNoteClient(row.id, input.clientId, "domain")
      reattributed += 1
    }
  }

  return { ok: true, reattributed }
}
