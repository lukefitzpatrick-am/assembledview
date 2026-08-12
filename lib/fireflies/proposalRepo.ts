/**
 * Postgres helpers for ava_task_proposals (Fireflies Stage 4 inbox).
 * Sync creates proposals only — never tasks.
 */
import "server-only"

import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { createTask } from "@/lib/codex/repo"
import {
  buildProposalDescription,
  isPossibleDuplicate,
  parseActionItems,
  type TeamMemberMatch,
} from "@/lib/fireflies/actionItems"
import {
  acceptProposalPure,
  dismissProposalPure,
  type AcceptEdits,
  type InboxProposal,
  type ProposalRow,
} from "@/lib/fireflies/proposals"
import type { SyncInsertNote } from "@/lib/fireflies/sync"

type Db = ReturnType<typeof getDb>

function rowToProposal(row: typeof schema.avaTaskProposals.$inferSelect): ProposalRow {
  return {
    id: row.id,
    sourceNoteId: row.sourceNoteId,
    clientId: row.clientId,
    proposedTitle: row.proposedTitle,
    proposedDescription: row.proposedDescription,
    proposedCategory: row.proposedCategory,
    proposedDueDate: row.proposedDueDate,
    proposedAssigneeEmail: row.proposedAssigneeEmail,
    proposedMbaNumber: row.proposedMbaNumber,
    status: row.status,
    decidedByEmail: row.decidedByEmail,
    decidedAt: row.decidedAt,
    createdTaskId: row.createdTaskId,
    decisionDiff: row.decisionDiff,
  }
}

function parseParticipants(raw: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((e) => e.trim().toLowerCase()).filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"))
}

export async function loadTeamRoster(
  database: Db = getDb()
): Promise<TeamMemberMatch[]> {
  const rows = await database
    .select({
      email: schema.teamMembers.email,
      name: schema.teamMembers.name,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.active, true))
  return rows
    .filter((r) => r.email?.trim() && r.name?.trim())
    .map((r) => ({
      email: r.email!.trim().toLowerCase(),
      name: r.name!.trim(),
    }))
}

/**
 * Insert ava_task_proposals for a synced note's action items.
 * Does NOT create tasks.
 */
export async function insertProposalsFromNote(
  args: { noteId: number; note: SyncInsertNote },
  database: Db = getDb()
): Promise<number> {
  const raw = args.note.actionItemsRaw
  if (!raw?.trim()) return 0

  const roster = await loadTeamRoster(database)
  const attendees = parseParticipants(args.note.participants)
  const items = parseActionItems(raw, roster, attendees)
  if (items.length === 0) return 0

  const values = items.map((item) => ({
    sourceNoteId: args.noteId,
    clientId: args.note.clientId,
    proposedTitle: item.title,
    proposedDescription: buildProposalDescription({
      sourceLine: item.sourceLine,
      meetingTitle: args.note.title,
      meetingUrl: args.note.transcriptUrl,
      meetingDate: args.note.meetingDate,
    }),
    proposedCategory: "meeting_followup",
    proposedDueDate: null as string | null,
    proposedAssigneeEmail: item.assigneeEmail,
    proposedMbaNumber: args.note.mbaNumber,
    avaRationale: item.sourceLine,
    status: "proposed",
  }))

  await database.insert(schema.avaTaskProposals).values(values)
  return values.length
}

export type InboxMeetingGroup = {
  note_id: number
  meeting_title: string | null
  meeting_date: string | null
  transcript_url: string | null
  mba_number: string | null
  client_id: number | null
  proposals: Array<{
    id: number
    proposed_title: string
    proposed_description: string | null
    proposed_assignee_email: string | null
    proposed_mba_number: string | null
    proposed_category: string | null
    proposed_due_date: string | null
    client_id: number | null
    source_note_id: number | null
    possible_duplicate: boolean
    status: string
    created_at: string
  }>
}

export async function listProposedInbox(
  database: Db = getDb()
): Promise<{ groups: InboxMeetingGroup[] }> {
  const rows = await database
    .select({
      proposal: schema.avaTaskProposals,
      meetingTitle: schema.clientNotes.title,
      meetingDate: schema.clientNotes.meetingDate,
      transcriptUrl: schema.clientNotes.transcriptUrl,
    })
    .from(schema.avaTaskProposals)
    .leftJoin(
      schema.clientNotes,
      eq(schema.avaTaskProposals.sourceNoteId, schema.clientNotes.id)
    )
    .where(eq(schema.avaTaskProposals.status, "proposed"))
    .orderBy(
      desc(schema.clientNotes.meetingDate),
      desc(schema.avaTaskProposals.id)
    )

  const mbaSet = new Set<string>()
  for (const r of rows) {
    const mba = (r.proposal.proposedMbaNumber ?? "").trim()
    if (mba) mbaSet.add(mba)
  }

  const openByMba = new Map<
    string,
    Array<{ title: string; mbaNumber: string | null }>
  >()
  if (mbaSet.size > 0) {
    const mbaLower = new Set([...mbaSet].map((m) => m.toLowerCase()))
    const openRows = await database
      .select({
        title: schema.tasks.title,
        mbaNumber: schema.tasks.mbaNumber,
      })
      .from(schema.tasks)
      .where(
        and(
          isNull(schema.tasks.deletedAt),
          ne(schema.tasks.status, "done"),
          isNotNull(schema.tasks.mbaNumber)
        )
      )
    for (const t of openRows) {
      const key = (t.mbaNumber ?? "").trim().toLowerCase()
      if (!key || !mbaLower.has(key)) continue
      const list = openByMba.get(key) ?? []
      list.push({ title: t.title, mbaNumber: t.mbaNumber })
      openByMba.set(key, list)
    }
  }

  const groupMap = new Map<number, InboxMeetingGroup>()
  for (const r of rows) {
    const p = r.proposal
    const noteId = p.sourceNoteId ?? 0
    let group = groupMap.get(noteId)
    if (!group) {
      group = {
        note_id: noteId,
        meeting_title: r.meetingTitle,
        meeting_date: r.meetingDate,
        transcript_url: r.transcriptUrl,
        mba_number: p.proposedMbaNumber,
        client_id: p.clientId,
        proposals: [],
      }
      groupMap.set(noteId, group)
    }
    const mbaKey = (p.proposedMbaNumber ?? "").trim().toLowerCase()
    const openTasks = mbaKey ? openByMba.get(mbaKey) ?? [] : []
    group.proposals.push({
      id: p.id,
      proposed_title: p.proposedTitle,
      proposed_description: p.proposedDescription,
      proposed_assignee_email: p.proposedAssigneeEmail,
      proposed_mba_number: p.proposedMbaNumber,
      proposed_category: p.proposedCategory,
      proposed_due_date: p.proposedDueDate,
      client_id: p.clientId,
      source_note_id: p.sourceNoteId,
      possible_duplicate: isPossibleDuplicate(
        p.proposedTitle,
        p.proposedMbaNumber,
        openTasks
      ),
      status: p.status,
      created_at: p.createdAt,
    })
  }

  return { groups: [...groupMap.values()] }
}

async function getProposal(
  id: number,
  database: Db
): Promise<ProposalRow | null> {
  const [row] = await database
    .select()
    .from(schema.avaTaskProposals)
    .where(eq(schema.avaTaskProposals.id, id))
    .limit(1)
  return row ? rowToProposal(row) : null
}

async function listOpenTasksForMba(mba: string, database: Db) {
  const rows = await database
    .select({
      title: schema.tasks.title,
      mbaNumber: schema.tasks.mbaNumber,
    })
    .from(schema.tasks)
    .where(
      and(
        isNull(schema.tasks.deletedAt),
        ne(schema.tasks.status, "done"),
        sql`lower(${schema.tasks.mbaNumber}) = ${mba.trim().toLowerCase()}`
      )
    )
  return rows
}

export async function acceptProposal(
  proposalId: number,
  decidedByEmail: string,
  edits: AcceptEdits | null = null,
  database: Db = getDb()
) {
  return acceptProposalPure(
    { proposalId, decidedByEmail, edits },
    {
      getProposal: (id) => getProposal(id, database),
      createTask: async (input, actorEmail, actorKind) => {
        const task = await createTask(
          {
            title: input.title,
            clientId: input.clientId,
            description: input.description,
            mbaNumber: input.mbaNumber,
            assigneeEmail: input.assigneeEmail,
            category: input.category,
            dueDate: input.dueDate,
            source: "ava",
            sourceNoteId: input.sourceNoteId,
            actorKind,
            createdByEmail: input.createdByEmail,
          },
          actorEmail,
          database
        )
        return { id: task.id, title: task.title }
      },
      markAccepted: async (id, patch) => {
        await database
          .update(schema.avaTaskProposals)
          .set({
            status: patch.status,
            createdTaskId: patch.createdTaskId,
            decidedByEmail: patch.decidedByEmail,
            decidedAt: patch.decidedAt,
            decisionDiff: patch.decisionDiff,
          })
          .where(eq(schema.avaTaskProposals.id, id))
      },
      listOpenTasksForMba: (mba) => listOpenTasksForMba(mba, database),
    }
  )
}

export async function dismissProposal(
  proposalId: number,
  decidedByEmail: string,
  database: Db = getDb()
) {
  return dismissProposalPure(
    { proposalId, decidedByEmail },
    {
      getProposal: (id) => getProposal(id, database),
      createTask: async () => {
        throw new Error("dismiss must not create tasks")
      },
      markDismissed: async (id, patch) => {
        await database
          .update(schema.avaTaskProposals)
          .set({
            status: patch.status,
            decidedByEmail: patch.decidedByEmail,
            decidedAt: patch.decidedAt,
            decisionDiff: patch.decisionDiff,
          })
          .where(eq(schema.avaTaskProposals.id, id))
      },
    }
  )
}

export async function batchAcceptForNote(
  noteId: number,
  decidedByEmail: string,
  database: Db = getDb()
): Promise<{
  accepted: number
  failed: Array<{ id: number; error: string }>
  taskIds: number[]
}> {
  const rows = await database
    .select({ id: schema.avaTaskProposals.id })
    .from(schema.avaTaskProposals)
    .where(
      and(
        eq(schema.avaTaskProposals.sourceNoteId, noteId),
        eq(schema.avaTaskProposals.status, "proposed")
      )
    )
    .orderBy(schema.avaTaskProposals.id)

  const failed: Array<{ id: number; error: string }> = []
  const taskIds: number[] = []
  let accepted = 0

  for (const row of rows) {
    const result = await acceptProposal(row.id, decidedByEmail, null, database)
    if (result.ok) {
      accepted += 1
      taskIds.push(result.taskId)
    } else {
      failed.push({ id: row.id, error: result.error })
    }
  }

  return { accepted, failed, taskIds }
}

export type { InboxProposal, AcceptEdits }
