import "server-only"

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { addSydneyDays } from "@/lib/codex/quickAddParse"
import {
  buildTimeEntryDraftRows,
  REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES,
  type TimeEntryDraftArgs,
} from "@/lib/fireflies/timeEntryDrafts"
import type { OverlapEntry } from "@/lib/myhours/overlap"
import type { StructureLink } from "@/lib/myhours/sync"
import type {
  TimeEntryProposal,
  TimeEntryProposalPatch,
} from "@/lib/myhours/timeEntryProposals"

type Db = ReturnType<typeof getDb>

export type TimeEntryProposalListRow = {
  id: number
  sourceNoteId: number
  memberEmail: string
  entryDate: string
  durationMinutes: number
  note: string
  clientId: number | null
  clientName: string | null
  mbaNumber: string | null
  campaignName: string | null
  myhoursProjectId: string | null
  myhoursTaskId: string | null
  myhoursLogId: string | null
  status: TimeEntryProposal["status"]
  blockReason: string | null
}

export type TimeEntryProposalContext = {
  clientId: number | null
  clientName: string | null
  mbaNumber: string | null
  campaignName: string | null
}

export async function listTimeEntryProposalsForWeek(
  weekStart: string,
  database: Db = getDb()
): Promise<TimeEntryProposalListRow[]> {
  const weekEnd = addSydneyDays(weekStart, 6)
  const rows = await database
    .select({
      id: schema.avaTimeEntryProposals.id,
      sourceNoteId: schema.avaTimeEntryProposals.sourceNoteId,
      memberEmail: schema.avaTimeEntryProposals.memberEmail,
      entryDate: schema.avaTimeEntryProposals.entryDate,
      durationMinutes: schema.avaTimeEntryProposals.durationMinutes,
      note: schema.avaTimeEntryProposals.note,
      clientId: schema.avaTimeEntryProposals.clientId,
      clientName: sql<string | null>`coalesce(${schema.clients.mpClientName}, ${schema.mediaPlanMasters.mpClientName})`,
      mbaNumber: schema.avaTimeEntryProposals.mbaNumber,
      campaignName: schema.mediaPlanMasters.campaignName,
      myhoursProjectId: schema.avaTimeEntryProposals.myhoursProjectId,
      myhoursTaskId: schema.avaTimeEntryProposals.myhoursTaskId,
      myhoursLogId: schema.avaTimeEntryProposals.myhoursLogId,
      status: schema.avaTimeEntryProposals.status,
      blockReason: schema.avaTimeEntryProposals.blockReason,
    })
    .from(schema.avaTimeEntryProposals)
    .leftJoin(
      schema.clients,
      eq(schema.clients.id, schema.avaTimeEntryProposals.clientId)
    )
    .leftJoin(
      schema.mediaPlanMasters,
      eq(
        schema.mediaPlanMasters.mbaNumber,
        schema.avaTimeEntryProposals.mbaNumber
      )
    )
    .where(
      and(
        gte(schema.avaTimeEntryProposals.entryDate, weekStart),
        lte(schema.avaTimeEntryProposals.entryDate, weekEnd)
      )
    )
    .orderBy(
      asc(schema.avaTimeEntryProposals.entryDate),
      asc(schema.avaTimeEntryProposals.memberEmail),
      asc(schema.avaTimeEntryProposals.id)
    )

  return rows.map((row) => ({
    ...row,
    status: row.status as TimeEntryProposal["status"],
  }))
}

export async function loadTimeEntryProposalContext(
  proposalId: number,
  database: Db = getDb()
): Promise<TimeEntryProposalContext | null> {
  const [row] = await database
    .select({
      clientId: schema.avaTimeEntryProposals.clientId,
      clientName: sql<string | null>`coalesce(${schema.clients.mpClientName}, ${schema.mediaPlanMasters.mpClientName})`,
      mbaNumber: schema.avaTimeEntryProposals.mbaNumber,
      campaignName: schema.mediaPlanMasters.campaignName,
    })
    .from(schema.avaTimeEntryProposals)
    .leftJoin(
      schema.clients,
      eq(schema.clients.id, schema.avaTimeEntryProposals.clientId)
    )
    .leftJoin(
      schema.mediaPlanMasters,
      eq(
        schema.mediaPlanMasters.mbaNumber,
        schema.avaTimeEntryProposals.mbaNumber
      )
    )
    .where(eq(schema.avaTimeEntryProposals.id, proposalId))
    .limit(1)

  return row ?? null
}

export async function listMyHoursLinks(
  database: Db = getDb()
): Promise<StructureLink[]> {
  const rows = await database.select().from(schema.myhoursLinks)
  return rows.map((row) => ({
    kind: row.kind as StructureLink["kind"],
    clientId: row.clientId,
    mbaNumber: row.mbaNumber,
    myhoursId: row.myhoursId,
    myhoursName: row.myhoursName ?? "",
  }))
}

export async function saveMyHoursLink(
  link: StructureLink,
  database: Db = getDb()
): Promise<void> {
  await database.insert(schema.myhoursLinks).values({
    kind: link.kind,
    clientId: link.clientId,
    mbaNumber: link.mbaNumber,
    myhoursId: link.myhoursId,
    myhoursName: link.myhoursName,
    createdBy: "time-entry-confirm",
  })
}

export async function listSameDayTimeEntries(
  memberEmail: string,
  entryDate: string,
  database: Db = getDb()
): Promise<OverlapEntry[]> {
  const rows = await database
    .select({
      myhoursLogId: schema.timeEntries.myhoursLogId,
      memberEmail: schema.timeEntries.memberEmail,
      entryDate: schema.timeEntries.entryDate,
      note: schema.timeEntries.note,
      durationMinutes: schema.timeEntries.durationMinutes,
      raw: schema.timeEntries.raw,
    })
    .from(schema.timeEntries)
    .where(
      and(
        sql`lower(${schema.timeEntries.memberEmail}) = ${memberEmail.trim().toLowerCase()}`,
        eq(schema.timeEntries.entryDate, entryDate)
      )
    )

  return rows
}

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
        updatedAt: new Date().toISOString(),
      },
      where: inArray(
        schema.avaTimeEntryProposals.status,
        REFRESHABLE_TIME_ENTRY_PROPOSAL_STATUSES
      ),
    })

  return rows.length
}
