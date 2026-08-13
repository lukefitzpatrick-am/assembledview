/**
 * Postgres helpers for ava_task_proposals (Fireflies Inbox) and
 * unique-roster auto-created tasks (`auto_created` + `ava_auto_key`).
 */
import "server-only"

import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { createTask, softDeleteTask } from "@/lib/codex/repo"
import {
  isPossibleDuplicate,
  type TeamMemberMatch,
} from "@/lib/fireflies/actionItems"
import type { RosterPerson } from "@/lib/fireflies/actionItemBlocks"
import {
  dismissAutoCreatedPure,
  persistActionItemPlan,
  planActionItems,
  type DismissalSignal,
} from "@/lib/fireflies/autoCreate"
import { parseEmailAliases } from "@/lib/fireflies/rosterAliases"
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
  const people = await loadAutoCreateRoster(database)
  return people.map((p) => ({ email: p.email, name: p.name }))
}

async function loadAutoCreateRoster(
  database: Db
): Promise<RosterPerson[]> {
  const rows = await database
    .select({
      email: schema.teamMembers.email,
      name: schema.teamMembers.name,
      emailAliases: schema.teamMembers.emailAliases,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.active, true))
  return rows
    .filter((r) => r.email?.trim() && r.name?.trim())
    .map((r) => ({
      email: r.email!.trim().toLowerCase(),
      name: r.name!.trim(),
      aliases: parseEmailAliases(r.emailAliases),
    }))
}

/**
 * Plan + persist unique-roster auto-created tasks and Inbox proposals
 * for a synced note. Idempotent on `ava_auto_key` / existing proposal titles.
 */
export async function insertProposalsFromNote(
  args: { noteId: number; note: SyncInsertNote },
  database: Db = getDb()
): Promise<number> {
  const raw = args.note.actionItemsRaw
  if (!raw?.trim()) return 0

  const roster = await loadAutoCreateRoster(database)
  const attendees = parseParticipants(args.note.participants)

  const existingKeyRows = await database
    .select({ key: schema.tasks.avaAutoKey })
    .from(schema.tasks)
    .where(isNotNull(schema.tasks.avaAutoKey))
  const existingAutoKeys = new Set(
    existingKeyRows.map((r) => r.key).filter((k): k is string => Boolean(k))
  )

  const openRows =
    args.note.clientId != null
      ? await database
          .select({
            title: schema.tasks.title,
            clientId: schema.tasks.clientId,
          })
          .from(schema.tasks)
          .where(
            and(
              isNull(schema.tasks.deletedAt),
              ne(schema.tasks.status, "done"),
              eq(schema.tasks.clientId, args.note.clientId)
            )
          )
      : []
  const openTasks = openRows
    .filter((r) => r.clientId != null)
    .map((r) => ({ title: r.title, clientId: Number(r.clientId) }))

  const existingProposalRows = await database
    .select({ title: schema.avaTaskProposals.proposedTitle })
    .from(schema.avaTaskProposals)
    .where(eq(schema.avaTaskProposals.sourceNoteId, args.noteId))
  const existingProposalKeys = new Set(
    existingProposalRows
      .map((r) => r.title?.trim().toLowerCase())
      .filter((t): t is string => Boolean(t))
  )

  let ruleAssigneeEmail: string | null = null
  if (args.note.clientId != null) {
    const [rule] = await database
      .select({ assigneeEmail: schema.assignmentRules.assigneeEmail })
      .from(schema.assignmentRules)
      .where(
        and(
          eq(schema.assignmentRules.active, true),
          eq(schema.assignmentRules.category, "meeting_followup"),
          eq(schema.assignmentRules.clientId, args.note.clientId)
        )
      )
      .limit(1)
    ruleAssigneeEmail = rule?.assigneeEmail?.trim().toLowerCase() || null
  }

  const plan = planActionItems(raw, {
    roster,
    attendeeEmails: attendees,
    clientId: args.note.clientId,
    mbaNumber: args.note.mbaNumber,
    isInternal: Boolean(args.note.isInternal),
    attributedType: args.note.attributedType ?? null,
    meetingTitle: args.note.title,
    meetingUrl: args.note.transcriptUrl,
    meetingDate: args.note.meetingDate,
    noteId: args.noteId,
    existingAutoKeys,
    openTasks,
    existingProposalKeys,
    ruleAssigneeEmail,
  })

  const result = await persistActionItemPlan(plan, {
    createTask: async (input, actorEmail, actorKind) => {
      const task = await createTask(
        {
          title: input.title,
          clientId: input.clientId,
          description: input.description,
          mbaNumber: input.mbaNumber,
          assigneeEmail: input.assigneeEmail,
          assigneeName: input.assigneeName,
          category: input.category,
          source: "ava",
          sourceNoteId: input.sourceNoteId,
          autoCreated: input.autoCreated,
          avaAutoKey: input.avaAutoKey,
          actorKind,
          createdByEmail: input.createdByEmail,
        },
        actorEmail,
        database
      )
      return { id: Number(task.id), title: task.title }
    },
    insertProposals: async (proposals) => {
      if (proposals.length === 0) return
      await database.insert(schema.avaTaskProposals).values(
        proposals.map((item) => ({
          sourceNoteId: args.noteId,
          clientId: args.note.clientId,
          proposedTitle: item.title,
          proposedDescription: item.description,
          proposedCategory: "meeting_followup",
          proposedDueDate: null as string | null,
          proposedAssigneeEmail: item.assigneeEmail,
          proposedMbaNumber: args.note.mbaNumber,
          avaRationale: item.sourceLine,
          status: "proposed",
        }))
      )
    },
    recordDismissal: async (row) => {
      await recordAutoCreatedDismissal(row, database)
    },
  })

  return result.proposalsCreated
}

async function recordAutoCreatedDismissal(
  row: DismissalSignal,
  database: Db
): Promise<void> {
  const assignee = (row.assigneeEmail ?? "").trim().toLowerCase()
  if (!assignee) return
  await database.insert(schema.assignmentRules).values({
    clientId: row.clientId,
    category: "meeting_followup",
    assigneeEmail: assignee,
    source: "learned",
    active: false,
  })
}

export async function dismissAutoCreatedTask(
  taskId: number,
  decidedByEmail: string,
  database: Db = getDb()
): Promise<{ ok: true } | { ok: false; error: string }> {
  return dismissAutoCreatedPure(
    { taskId, decidedByEmail },
    {
      getTask: async () => {
        const [row] = await database
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, taskId))
          .limit(1)
        if (!row) return null
        return {
          id: row.id,
          autoCreated: Boolean(row.autoCreated),
          deletedAt: row.deletedAt,
          title: row.title,
          clientId: row.clientId,
          assigneeEmail: row.assigneeEmail,
          sourceNoteId: row.sourceNoteId,
        }
      },
      softDelete: () => softDeleteTask(taskId, decidedByEmail, database),
      recordDismissal: (row) => recordAutoCreatedDismissal(row, database),
    }
  )
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
        return { id: Number(task.id), title: task.title }
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
