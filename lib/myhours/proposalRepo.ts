import "server-only"

import { eq, inArray, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  buildTimeEntryDraftRows,
  REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES,
  type TimeEntryDraftArgs,
} from "@/lib/fireflies/timeEntryDrafts"
import type {
  TimeEntryProposal,
  TimeEntryProposalPatch,
} from "@/lib/myhours/timeEntryProposals"

type Db = ReturnType<typeof getDb>

export async function loadTimeEntryProposal(
  proposalId: number,
  database: Db = getDb()
): Promise<TimeEntryProposal | null> {
  const [row] = await database
    .select({
      id: schema.avaTimeEntryProposals.id,
      sourceNoteId: schema.avaTimeEntryProposals.sourceNoteId,
      memberEmail: schema.avaTimeEntryProposals.memberEmail,
      entryDate: schema.avaTimeEntryProposals.entryDate,
      durationMinutes: schema.avaTimeEntryProposals.durationMinutes,
      note: schema.avaTimeEntryProposals.note,
      clientId: schema.avaTimeEntryProposals.clientId,
      mbaNumber: schema.avaTimeEntryProposals.mbaNumber,
      myhoursProjectId: schema.avaTimeEntryProposals.myhoursProjectId,
      myhoursTaskId: schema.avaTimeEntryProposals.myhoursTaskId,
      myhoursLogId: schema.avaTimeEntryProposals.myhoursLogId,
      status: schema.avaTimeEntryProposals.status,
      blockReason: schema.avaTimeEntryProposals.blockReason,
      meetingStartIso: schema.clientNotes.meetingDate,
    })
    .from(schema.avaTimeEntryProposals)
    .leftJoin(
      schema.clientNotes,
      eq(
        schema.clientNotes.id,
        schema.avaTimeEntryProposals.sourceNoteId
      )
    )
    .where(eq(schema.avaTimeEntryProposals.id, proposalId))
    .limit(1)

  if (!row) return null
  return {
    ...row,
    status: row.status as TimeEntryProposal["status"],
  }
}

export async function updateTimeEntryProposal(
  proposalId: number,
  patch: TimeEntryProposalPatch,
  database: Db = getDb()
): Promise<void> {
  await database
    .update(schema.avaTimeEntryProposals)
    .set(patch)
    .where(eq(schema.avaTimeEntryProposals.id, proposalId))
}

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
