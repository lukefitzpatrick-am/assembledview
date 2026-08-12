/**
 * Fireflies pull → client_notes + fireflies_sync_state cursor.
 */
import { attributeMeeting } from "./attribution.js"
import { defaultAssembledDomainSet } from "./internalDomains.js"

export { defaultAssembledDomainSet }
import { FirefliesClient } from "./client.js"
import type { AttributionContext, FirefliesTranscript } from "./types.js"

export type SyncInsertNote = {
  firefliesMeetingId: string
  clientId: number | null
  mbaNumber: string | null
  source: "fireflies"
  title: string | null
  body: string | null
  meetingDate: string | null
  participants: string | null
  organizerEmail: string | null
  matchedBy: string | null
  durationSeconds: number | null
  transcriptUrl: string | null
  isInternal: boolean
  /** Raw Fireflies action_items text for proposal extraction. */
  actionItemsRaw: string | null
}

export type FirefliesSyncDeps = {
  getApiKey: () => string
  transport?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>
  loadCursor: () => Promise<string | null>
  saveRun: (row: {
    cursorFrom: string | null
    meetingsSeen: number
    notesCreated: number
    notesSkipped: number
    unmatched: number
    status: "ok" | "error"
    error?: string | null
  }) => Promise<void>
  hasMeeting: (firefliesMeetingId: string) => Promise<boolean>
  /** Returns inserted client_notes.id */
  insertNote: (note: SyncInsertNote) => Promise<{ id: number }>
  /**
   * Create ava_task_proposals for action items — MUST NOT create tasks.
   */
  insertProposalsFromNote?: (args: {
    noteId: number
    note: SyncInsertNote
  }) => Promise<number>
  loadAttributionContext: () => Promise<AttributionContext>
  /** Optional injectable list (tests). */
  listTranscripts?: (
    fromDate: string | null
  ) => Promise<FirefliesTranscript[]>
}

export type FirefliesSyncResult = {
  status: "ok" | "error"
  meetingsSeen: number
  notesCreated: number
  notesSkipped: number
  unmatched: number
  proposalsCreated?: number
  cursorFrom: string | null
  error?: string
}

function toIsoMeetingDate(date: number | string | null): string | null {
  if (date == null) return null
  if (typeof date === "number") {
    const ms = date < 1e12 ? date * 1000 : date
    return new Date(ms).toISOString()
  }
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function durationToSeconds(duration: number | null): number | null {
  if (duration == null || !Number.isFinite(duration) || duration < 0) return null
  // Fireflies duration is minutes (float).
  return Math.round(duration * 60)
}

function buildBody(t: FirefliesTranscript): string {
  const summary =
    t.summary?.overview ??
    t.summary?.short_summary ??
    ""
  const actions = t.summary?.action_items ?? ""
  return JSON.stringify({
    summary,
    action_items: actions,
  })
}

function actionItemsRaw(t: FirefliesTranscript): string | null {
  const raw = t.summary?.action_items
  if (raw == null) return null
  const s = String(raw).trim()
  return s || null
}

function attendeeEmails(t: FirefliesTranscript): string[] {
  const fromParticipants = (t.participants ?? []).map(String)
  if (t.organizer_email) fromParticipants.push(String(t.organizer_email))
  return fromParticipants
}

export async function runFirefliesSync(
  deps: FirefliesSyncDeps
): Promise<FirefliesSyncResult> {
  const cursor = await deps.loadCursor()
  const ctx = await deps.loadAttributionContext()

  let transcripts: FirefliesTranscript[]
  try {
    if (deps.listTranscripts) {
      transcripts = await deps.listTranscripts(cursor)
    } else {
      const client = new FirefliesClient({
        apiKey: deps.getApiKey(),
        transport: deps.transport,
      })
      transcripts = await client.listTranscriptsSince(cursor)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.saveRun({
      cursorFrom: cursor,
      meetingsSeen: 0,
      notesCreated: 0,
      notesSkipped: 0,
      unmatched: 0,
      status: "error",
      error: message,
    })
    return {
      status: "error",
      meetingsSeen: 0,
      notesCreated: 0,
      notesSkipped: 0,
      unmatched: 0,
      cursorFrom: cursor,
      error: message,
    }
  }

  let notesCreated = 0
  let notesSkipped = 0
  let unmatched = 0
  let proposalsCreated = 0
  let maxDateMs = cursor ? Date.parse(cursor) : 0
  if (!Number.isFinite(maxDateMs)) maxDateMs = 0

  for (const t of transcripts) {
    if (!t.id) continue
    if (await deps.hasMeeting(t.id)) {
      notesSkipped += 1
      continue
    }

    const emails = attendeeEmails(t)
    const attr = attributeMeeting(
      { title: t.title, attendeeEmails: emails },
      ctx
    )
    if (attr.kind === "unattributed") unmatched += 1

    const meetingDate = toIsoMeetingDate(t.date)
    if (meetingDate) {
      const ms = Date.parse(meetingDate)
      if (Number.isFinite(ms) && ms > maxDateMs) maxDateMs = ms
    }

    const note: SyncInsertNote = {
      firefliesMeetingId: t.id,
      clientId: attr.clientId,
      mbaNumber: attr.mbaNumber,
      source: "fireflies",
      title: t.title,
      body: buildBody(t),
      meetingDate,
      participants: JSON.stringify(
        [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
      ),
      organizerEmail: t.organizer_email
        ? String(t.organizer_email).trim().toLowerCase()
        : null,
      matchedBy: attr.matchedBy,
      durationSeconds: durationToSeconds(t.duration),
      transcriptUrl: t.transcript_url ?? null,
      isInternal: attr.isInternal,
      actionItemsRaw: actionItemsRaw(t),
    }

    const { id: noteId } = await deps.insertNote(note)
    notesCreated += 1

    if (deps.insertProposalsFromNote && note.actionItemsRaw) {
      proposalsCreated += await deps.insertProposalsFromNote({
        noteId,
        note,
      })
    }
  }

  const nextCursor =
    maxDateMs > 0 ? new Date(maxDateMs).toISOString() : cursor

  await deps.saveRun({
    cursorFrom: nextCursor,
    meetingsSeen: transcripts.length,
    notesCreated,
    notesSkipped,
    unmatched,
    status: "ok",
    error: null,
  })

  return {
    status: "ok",
    meetingsSeen: transcripts.length,
    notesCreated,
    notesSkipped,
    unmatched,
    proposalsCreated,
    cursorFrom: nextCursor ?? null,
  }
}

