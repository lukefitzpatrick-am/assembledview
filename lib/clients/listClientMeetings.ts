/**
 * Client hub meetings: Fireflies notes for this client_id.
 * Sync remains client_notes (no parallel table).
 */
import "server-only"

import { and, desc, eq, inArray, isNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  selectClientMeetings,
  type ClientMeeting,
} from "@/lib/clients/selectClientMeetings"

export type { ClientMeeting } from "@/lib/clients/selectClientMeetings"
export { selectClientMeetings } from "@/lib/clients/selectClientMeetings"

export async function listClientMeetings(
  clientId: number,
  database = getDb(),
): Promise<ClientMeeting[]> {
  const rows = await database
    .select({
      id: schema.clientNotes.id,
      clientId: schema.clientNotes.clientId,
      title: schema.clientNotes.title,
      meetingDate: schema.clientNotes.meetingDate,
      durationSeconds: schema.clientNotes.durationSeconds,
      transcriptUrl: schema.clientNotes.transcriptUrl,
      body: schema.clientNotes.body,
    })
    .from(schema.clientNotes)
    .where(eq(schema.clientNotes.clientId, clientId))
    .orderBy(desc(schema.clientNotes.meetingDate), desc(schema.clientNotes.id))

  const noteIds = rows.map((r) => r.id)
  const autoCreatedNoteIds = new Set<number>()
  if (noteIds.length > 0) {
    const tasks = await database
      .select({
        sourceNoteId: schema.tasks.sourceNoteId,
        autoCreated: schema.tasks.autoCreated,
        deletedAt: schema.tasks.deletedAt,
      })
      .from(schema.tasks)
      .where(
        and(
          inArray(schema.tasks.sourceNoteId, noteIds),
          eq(schema.tasks.autoCreated, true),
          isNull(schema.tasks.deletedAt),
        ),
      )
    for (const t of tasks) {
      if (t.sourceNoteId != null) autoCreatedNoteIds.add(t.sourceNoteId)
    }
  }

  return selectClientMeetings(rows, clientId, autoCreatedNoteIds)
}
