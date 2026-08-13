/**
 * Publisher Hub meetings: Fireflies notes attributed to a catalogue publisher.
 * Sync remains client_notes (no parallel table).
 */
import "server-only"

import { and, desc, eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { PublisherMeeting } from "@/lib/publisher/selectPublisherMeetings"

export type { PublisherMeeting } from "@/lib/publisher/selectPublisherMeetings"
export { selectPublisherMeetings } from "@/lib/publisher/selectPublisherMeetings"

export async function listPublisherMeetings(
  publisherId: number,
  database = getDb(),
): Promise<PublisherMeeting[]> {
  const rows = await database
    .select({
      id: schema.clientNotes.id,
      publisherId: schema.clientNotes.publisherId,
      attributedType: schema.clientNotes.attributedType,
      title: schema.clientNotes.title,
      meetingDate: schema.clientNotes.meetingDate,
      durationSeconds: schema.clientNotes.durationSeconds,
      transcriptUrl: schema.clientNotes.transcriptUrl,
    })
    .from(schema.clientNotes)
    .where(
      and(
        eq(schema.clientNotes.publisherId, publisherId),
        eq(schema.clientNotes.attributedType, "publisher"),
      ),
    )
    .orderBy(desc(schema.clientNotes.meetingDate), desc(schema.clientNotes.id))

  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    meeting_date: n.meetingDate,
    duration_seconds: n.durationSeconds,
    transcript_url: n.transcriptUrl,
  }))
}
