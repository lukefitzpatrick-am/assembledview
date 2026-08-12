import "server-only"

import { inArray, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  buildTimeEntryDraftRows,
  REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES,
  type TimeEntryDraftArgs,
} from "@/lib/fireflies/timeEntryDrafts"

type Db = ReturnType<typeof getDb>

/**
 * Upsert Fireflies-derived time-entry drafts.
 * Human terminal decisions are protected by the conflict-update predicate.
 */
export async function upsertTimeEntryDraftsForNote(
  args: TimeEntryDraftArgs,
  database: Db = getDb()
): Promise<number> {
  const rows = buildTimeEntryDraftRows(args)
  if (rows.length === 0) return 0

  await database
    .insert(schema.avaTimeEntryProposals)
    .values(
      rows.map((row) => ({
        ...row,
        status: "proposed",
        blockReason: null,
      }))
    )
    .onConflictDoUpdate({
      target: [
        schema.avaTimeEntryProposals.sourceNoteId,
        schema.avaTimeEntryProposals.memberEmail,
      ],
      set: {
        entryDate: sql`excluded.entry_date`,
        durationMinutes: sql`excluded.duration_minutes`,
        note: sql`excluded.note`,
        clientId: sql`excluded.client_id`,
        mbaNumber: sql`excluded.mba_number`,
        status: "proposed",
        blockReason: null,
        updatedAt: new Date().toISOString(),
      },
      where: inArray(
        schema.avaTimeEntryProposals.status,
        REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES
      ),
    })

  return rows.length
}
