/**
 * Human accept / dismiss for ava_task_proposals.
 * NOTHING auto-creates a task — only acceptProposal* does.
 */
import { isPossibleDuplicate } from "./actionItems.js"

export type ProposalRow = {
  id: number
  sourceNoteId: number | null
  clientId: number | null
  proposedTitle: string
  proposedDescription: string | null
  proposedCategory: string | null
  proposedDueDate: string | null
  proposedAssigneeEmail: string | null
  proposedMbaNumber: string | null
  status: string
  decidedByEmail: string | null
  decidedAt: string | null
  createdTaskId: number | null
  decisionDiff?: unknown
}

export type AcceptEdits = {
  title?: string
  description?: string | null
  clientId?: number | null
  mbaNumber?: string | null
  assigneeEmail?: string | null
  category?: string | null
  dueDate?: string | null
}

export type CreateTaskFn = (
  input: {
    title: string
    clientId: number
    description?: string | null
    mbaNumber?: string | null
    assigneeEmail?: string | null
    category?: string | null
    dueDate?: string | null
    source: "ava"
    sourceNoteId?: number | null
    createdByEmail: string
  },
  actorEmail: string,
  actorKind: "ava"
) => Promise<{ id: number; title: string }>

export async function acceptProposalPure(
  input: {
    proposalId: number
    decidedByEmail: string
    edits: AcceptEdits | null
  },
  deps: {
    getProposal: (id: number) => Promise<ProposalRow | null>
    createTask: CreateTaskFn
    markAccepted: (
      id: number,
      patch: {
        status: "accepted" | "accepted_edited"
        createdTaskId: number
        decidedByEmail: string
        decidedAt: string
        decisionDiff: unknown
      }
    ) => Promise<void>
    listOpenTasksForMba: (
      mba: string
    ) => Promise<Array<{ title: string; mbaNumber: string | null }>>
  }
): Promise<
  | { ok: true; taskId: number; possibleDuplicate: boolean }
  | { ok: false; error: string }
> {
  const proposal = await deps.getProposal(input.proposalId)
  if (!proposal) return { ok: false, error: "not_found" }
  if (proposal.status !== "proposed") {
    return { ok: false, error: "not_proposed" }
  }

  const edits = input.edits ?? {}
  const title = (edits.title ?? proposal.proposedTitle).trim()
  const clientId = edits.clientId !== undefined ? edits.clientId : proposal.clientId
  const mbaNumber =
    edits.mbaNumber !== undefined ? edits.mbaNumber : proposal.proposedMbaNumber
  const description =
    edits.description !== undefined
      ? edits.description
      : proposal.proposedDescription
  const assigneeEmail =
    edits.assigneeEmail !== undefined
      ? edits.assigneeEmail
      : proposal.proposedAssigneeEmail
  const category =
    edits.category !== undefined ? edits.category : proposal.proposedCategory
  const dueDate =
    edits.dueDate !== undefined ? edits.dueDate : proposal.proposedDueDate

  if (!title) return { ok: false, error: "title_required" }
  if (clientId == null || !Number.isFinite(clientId)) {
    return { ok: false, error: "client_required" }
  }

  const openTasks = mbaNumber
    ? await deps.listOpenTasksForMba(mbaNumber)
    : []
  const possibleDuplicate = isPossibleDuplicate(title, mbaNumber, openTasks)

  const decidedBy = input.decidedByEmail.trim().toLowerCase()
  const task = await deps.createTask(
    {
      title,
      clientId,
      description: description ?? null,
      mbaNumber: mbaNumber ?? null,
      assigneeEmail: assigneeEmail?.trim().toLowerCase() || null,
      category: category ?? "meeting_followup",
      dueDate: dueDate ?? null,
      source: "ava",
      sourceNoteId: proposal.sourceNoteId,
      createdByEmail: decidedBy,
    },
    decidedBy,
    "ava"
  )

  const edited =
    edits.title != null ||
    edits.description !== undefined ||
    edits.clientId !== undefined ||
    edits.mbaNumber !== undefined ||
    edits.assigneeEmail !== undefined ||
    edits.category !== undefined ||
    edits.dueDate !== undefined

  const now = new Date().toISOString()
  await deps.markAccepted(proposal.id, {
    status: edited ? "accepted_edited" : "accepted",
    createdTaskId: task.id,
    decidedByEmail: decidedBy,
    decidedAt: now,
    decisionDiff: edited
      ? { edits, possibleDuplicate }
      : { possibleDuplicate },
  })

  return { ok: true, taskId: task.id, possibleDuplicate }
}

export type DismissPatch = {
  status: "rejected"
  decidedByEmail: string
  decidedAt: string
  decisionDiff: unknown
}

export async function dismissProposalPure(
  input: { proposalId: number; decidedByEmail: string },
  deps: {
    getProposal: (id: number) => Promise<ProposalRow | null>
    createTask: CreateTaskFn
    markDismissed: (id: number, patch: DismissPatch) => Promise<void>
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const proposal = await deps.getProposal(input.proposalId)
  if (!proposal) return { ok: false, error: "not_found" }
  if (proposal.status !== "proposed") {
    return { ok: false, error: "not_proposed" }
  }

  const decidedBy = input.decidedByEmail.trim().toLowerCase()
  const now = new Date().toISOString()
  await deps.markDismissed(proposal.id, {
    status: "rejected",
    decidedByEmail: decidedBy,
    decidedAt: now,
    decisionDiff: { action: "dismiss", at: now },
  })
  return { ok: true }
}

/**
 * Dismiss every `proposed` row for a meeting in one bulk write.
 * Operates on the full note set — never the currently loaded Inbox page.
 */
export async function dismissAllProposedForNotePure(
  input: { noteId: number; decidedByEmail: string },
  deps: {
    markDismissedBulk: (noteId: number, patch: DismissPatch) => Promise<number>
  }
): Promise<{ ok: true; dismissed: number } | { ok: false; error: string }> {
  if (!Number.isFinite(input.noteId) || input.noteId <= 0) {
    return { ok: false, error: "note_id_required" }
  }
  const decidedBy = input.decidedByEmail.trim().toLowerCase()
  if (!decidedBy) return { ok: false, error: "email_required" }
  const now = new Date().toISOString()
  const dismissed = await deps.markDismissedBulk(input.noteId, {
    status: "rejected",
    decidedByEmail: decidedBy,
    decidedAt: now,
    decisionDiff: { action: "dismiss", at: now },
  })
  return { ok: true, dismissed }
}

export type InboxProposal = ProposalRow & {
  possibleDuplicate: boolean
  meetingTitle: string | null
  meetingDate: string | null
  transcriptUrl: string | null
}
