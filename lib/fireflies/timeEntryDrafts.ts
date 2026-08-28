import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"

import type { TimeEntryProposalStatus } from "@/db/schema/myhours"
import type { SyncInsertNote } from "@/lib/fireflies/sync"
import {
  resolveRosterEmailResult,
  type TeamMemberIdentity,
} from "@/lib/fireflies/rosterAliases"

const REFRESHABLE_STATUSES = new Set<TimeEntryProposalStatus>([
  "proposed",
  "blocked_overlap",
  "blocked_structure",
])

export type TimeEntryDraftRow = {
  sourceNoteId: number
  memberEmail: string
  entryDate: string
  durationMinutes: number
  note: string
  clientId: number
  mbaNumber: string | null
}

export type TimeEntryDraftArgs = {
  noteId: number
  note: SyncInsertNote
  activeMemberEmails: readonly string[]
  roster?: readonly TeamMemberIdentity[]
}

function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function participantEmails(raw: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map(normaliseEmail).filter(Boolean)
    }
  } catch {
    // Retain compatibility with older comma/whitespace participant strings.
  }
  return raw
    .split(/[,;\s]+/)
    .map(normaliseEmail)
    .filter((email) => email.includes("@"))
}

function identitiesFromArgs(args: TimeEntryDraftArgs): TeamMemberIdentity[] {
  if (args.roster && args.roster.length > 0) {
    return [...args.roster]
  }
  const seen = new Set<string>()
  const out: TeamMemberIdentity[] = []
  for (const raw of args.activeMemberEmails) {
    const email = normaliseEmail(raw)
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ canonicalEmail: email, name: email })
  }
  return out
}

export function isRefreshableTimeEntryProposalStatus(
  status: string
): boolean {
  return REFRESHABLE_STATUSES.has(status as TimeEntryProposalStatus)
}

export function buildTimeEntryDrafts(args: TimeEntryDraftArgs): {
  rows: TimeEntryDraftRow[]
  declined: Array<{ attendeeEmail: string; holders: TeamMemberIdentity[] }>
} {
  const { note } = args
  if (note.isInternal || note.clientId == null || !note.meetingDate) {
    return { rows: [], declined: [] }
  }

  const identities = identitiesFromArgs(args)
  if (identities.length === 0) return { rows: [], declined: [] }

  const matchedCanonical = new Set<string>()
  const declined: Array<{
    attendeeEmail: string
    holders: TeamMemberIdentity[]
  }> = []
  for (const email of participantEmails(note.participants)) {
    const resolved = resolveRosterEmailResult(email, identities)
    if (resolved.kind === "ambiguous") {
      declined.push({ attendeeEmail: email, holders: resolved.members })
      continue
    }
    if (resolved.kind !== "unique") continue
    matchedCanonical.add(resolved.member.canonicalEmail)
  }

  const rows = [...matchedCanonical].map((memberEmail) => ({
    sourceNoteId: args.noteId,
    memberEmail,
    entryDate: sydneyYmdFromUtcInstant(note.meetingDate!),
    durationMinutes: Math.round((note.durationSeconds ?? 0) / 60),
    note: `${note.title ?? ""} (Fireflies)`,
    clientId: note.clientId!,
    mbaNumber: note.mbaNumber?.trim().toLowerCase() || null,
  }))
  return { rows, declined }
}

export function buildTimeEntryDraftRows(
  args: TimeEntryDraftArgs
): TimeEntryDraftRow[] {
  return buildTimeEntryDrafts(args).rows
}

export const REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES = [
  ...REFRESHABLE_STATUSES,
] as const
