/**
 * Client hub meetings selection: client_notes where client_id = this client.
 * Newest meeting_date first, then higher id. No parallel meetings table.
 */
import { summaryFromNoteBody } from "@/lib/fireflies/noteBody"

export type ClientMeeting = {
  id: number
  title: string | null
  meeting_date: string | null
  duration_seconds: number | null
  transcript_url: string | null
  summary: string | null
  auto_created_tasks: boolean
}

export type ClientMeetingNote = {
  id: number
  clientId: number | null
  title: string | null
  meetingDate: string | null
  durationSeconds: number | null
  transcriptUrl: string | null
  body?: string | null
}

function meetingDateMs(value: string | null): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

export function noteHasAutoCreatedTasks(
  noteId: number,
  tasks: Array<{
    sourceNoteId: number | null
    autoCreated: boolean
    deletedAt?: string | null
  }>,
): boolean {
  return tasks.some(
    (t) =>
      t.sourceNoteId === noteId && t.autoCreated && (t.deletedAt == null || t.deletedAt === ""),
  )
}

export function selectClientMeetings(
  notes: ClientMeetingNote[],
  clientId: number,
  autoCreatedNoteIds: ReadonlySet<number> = new Set(),
): ClientMeeting[] {
  return notes
    .filter((n) => n.clientId === clientId)
    .toSorted((a, b) => {
      const byDate = meetingDateMs(b.meetingDate) - meetingDateMs(a.meetingDate)
      if (byDate !== 0) return byDate
      return b.id - a.id
    })
    .map((n) => ({
      id: n.id,
      title: n.title,
      meeting_date: n.meetingDate,
      duration_seconds: n.durationSeconds,
      transcript_url: n.transcriptUrl,
      summary: summaryFromNoteBody(n.body ?? null),
      auto_created_tasks: autoCreatedNoteIds.has(n.id),
    }))
}
