import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"

import type { TimeEntryProposalStatus } from "@/db/schema/myhours"
import type { SyncInsertNote } from "@/lib/fireflies/sync"

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

export function isRefreshableTimeEntryProposalStatus(
  status: string
): boolean {
  return REFRESHABLE_STATUSES.has(status as TimeEntryProposalStatus)
}

export function buildTimeEntryDraftRows(
  args: TimeEntryDraftArgs
): TimeEntryDraftRow[] {
  const { note } = args
  if (note.isInternal || note.clientId == null || !note.meetingDate) return []

  const activeRoster = new Set(
    args.activeMemberEmails.map(normaliseEmail).filter(Boolean)
  )
  if (activeRoster.size === 0) return []

  const matchedEmails = new Set(
    participantEmails(note.participants).filter((email) =>
      activeRoster.has(email)
    )
  )

  return [...matchedEmails].map((memberEmail) => ({
    sourceNoteId: args.noteId,
    memberEmail,
    entryDate: sydneyYmdFromUtcInstant(note.meetingDate!),
    durationMinutes: Math.round((note.durationSeconds ?? 0) / 60),
    note: `${note.title ?? ""} (Fireflies)`,
    clientId: note.clientId!,
    mbaNumber: note.mbaNumber?.trim().toLowerCase() || null,
  }))
}

export const REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES = [
  ...REFRESHABLE_STATUSES,
] as const
