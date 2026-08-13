/**
 * CLIENT-attributed Fireflies action items → auto-create roster tasks
 * or Inbox proposals. Non-roster names stay on the note only.
 */
import { createHash } from "node:crypto"

import {
  parsePersonBlocks,
  resolveBlockAssignee,
  type RosterPerson,
} from "./actionItemBlocks.js"

export type OpenTaskDup = { title: string; clientId: number }

export type AutoCreateDeps = {
  roster: RosterPerson[]
  attendeeEmails: string[]
  clientId: number | null
  mbaNumber: string | null
  isInternal: boolean
  attributedType?: "client" | "publisher" | "internal" | "new_business" | null
  meetingTitle: string | null
  meetingUrl: string | null
  meetingDate: string | null
  noteId: number
  existingAutoKeys: Set<string>
  openTasks: OpenTaskDup[]
  existingProposalKeys: Set<string>
  ruleAssigneeEmail: string | null
}

export type PlannedAutoTask = {
  title: string
  description: string
  assigneeEmail: string
  assigneeName: string
  clientId: number
  mbaNumber: string | null
  source: "ava"
  actorKind: "ava"
  autoCreated: true
  sourceNoteId: number
  avaAutoKey: string
  createdByEmail: string
  category: "meeting_followup"
}

export type PlannedProposal = {
  title: string
  sourceLine: string
  assigneeEmail: string | null
  blockName: string
  description: string
}

export type ActionItemPlan = {
  autoCreates: PlannedAutoTask[]
  proposals: PlannedProposal[]
  skipped: Array<{ blockName: string; line: string }>
}

export function avaAutoKey(
  noteId: number,
  blockName: string,
  itemLine: string
): string {
  const norm = `${noteId}|${blockName.trim().toLowerCase()}|${itemLine.trim().toLowerCase()}`
  return createHash("sha256").update(norm).digest("hex").slice(0, 40)
}

export function isOpenDuplicateForClient(
  title: string,
  clientId: number,
  openTasks: OpenTaskDup[]
): boolean {
  const needle = title.trim().toLowerCase()
  if (!needle) return false
  return openTasks.some(
    (t) =>
      t.clientId === clientId && t.title.trim().toLowerCase() === needle
  )
}

export function buildAutoTaskDescription(args: {
  meetingTitle: string | null
  meetingUrl: string | null
  meetingDate: string | null
  timestamp: string | null
  sourceLine: string
}): string {
  const parts = [
    `From meeting: ${args.meetingTitle?.trim() || "(untitled)"}`,
    args.meetingDate ? `Date: ${args.meetingDate}` : null,
    args.timestamp ? `Timestamp: ${args.timestamp}` : null,
    args.meetingUrl ? `Transcript: ${args.meetingUrl}` : null,
    "",
    `> ${args.sourceLine}`,
  ].filter((p) => p != null)
  return parts.join("\n")
}

export function classifyActionItem(args: {
  clientId: number | null
  isInternal: boolean
  resolutionKind: "unique" | "unassigned" | "ambiguous" | "unknown"
}): { action: "auto_create" | "proposal" | "skip" } {
  if (args.resolutionKind === "unknown") return { action: "skip" }
  if (args.isInternal) {
    return args.resolutionKind === "unique"
      ? { action: "skip" }
      : { action: "proposal" }
  }
  if (
    args.resolutionKind === "unique" &&
    args.clientId != null &&
    Number.isFinite(args.clientId)
  ) {
    return { action: "auto_create" }
  }
  return { action: "proposal" }
}

function proposalKey(blockName: string, title: string): string {
  return `${blockName}|${title}`.toLowerCase()
}

export function planActionItems(
  raw: string | null | undefined,
  deps: AutoCreateDeps
): ActionItemPlan {
  const plan: ActionItemPlan = {
    autoCreates: [],
    proposals: [],
    skipped: [],
  }
  if (
    deps.attributedType === "publisher" ||
    deps.attributedType === "internal" ||
    deps.attributedType === "new_business"
  ) {
    return plan
  }
  const blocks = parsePersonBlocks(raw)
  for (const block of blocks) {
    const resolution = resolveBlockAssignee(
      block.name,
      deps.roster,
      deps.attendeeEmails
    )
    const classified = classifyActionItem({
      clientId: deps.clientId,
      isInternal: deps.isInternal,
      resolutionKind: resolution.kind,
    })

    for (const item of block.items) {
      const title = item.line.trim()
      if (!title) continue

      if (classified.action === "skip") {
        plan.skipped.push({ blockName: block.name, line: title })
        continue
      }

      const description = buildAutoTaskDescription({
        meetingTitle: deps.meetingTitle,
        meetingUrl: deps.meetingUrl,
        meetingDate: deps.meetingDate,
        timestamp: item.timestamp,
        sourceLine: title,
      })

      if (classified.action === "auto_create" && resolution.kind === "unique") {
        if (deps.clientId == null) continue
        const key = avaAutoKey(deps.noteId, block.name, title)
        if (deps.existingAutoKeys.has(key)) continue
        if (isOpenDuplicateForClient(title, deps.clientId, deps.openTasks)) {
          continue
        }
        const email = resolution.member.email.trim().toLowerCase()
        plan.autoCreates.push({
          title,
          description,
          assigneeEmail: email,
          assigneeName: resolution.member.name,
          clientId: deps.clientId,
          mbaNumber: deps.mbaNumber,
          source: "ava",
          actorKind: "ava",
          autoCreated: true,
          sourceNoteId: deps.noteId,
          avaAutoKey: key,
          createdByEmail: email,
          category: "meeting_followup",
        })
        continue
      }

      const pKey = proposalKey(block.name, title)
      if (
        deps.existingProposalKeys.has(pKey) ||
        deps.existingProposalKeys.has(title.toLowerCase())
      ) {
        continue
      }

      const uniqueEmail =
        resolution.kind === "unique"
          ? resolution.member.email.trim().toLowerCase()
          : null
      const suggested =
        resolution.kind === "ambiguous"
          ? deps.ruleAssigneeEmail?.trim().toLowerCase() || null
          : uniqueEmail

      plan.proposals.push({
        title,
        sourceLine: title,
        assigneeEmail: suggested,
        blockName: block.name,
        description,
      })
    }
  }
  return plan
}

export type PersistCreateTaskFn = (
  input: {
    title: string
    clientId: number
    description: string
    mbaNumber: string | null
    assigneeEmail: string
    assigneeName: string
    category: string
    source: "ava"
    sourceNoteId: number
    autoCreated: boolean
    avaAutoKey: string
    createdByEmail: string
  },
  actorEmail: string,
  actorKind: "ava"
) => Promise<{ id: number; title: string }>

export type PersistActionItemDeps = {
  createTask: PersistCreateTaskFn
  insertProposals: (proposals: PlannedProposal[]) => Promise<void>
  recordDismissal: (row: DismissalSignal) => Promise<void>
}

export type DismissalSignal = {
  action: "auto_created_dismiss"
  taskId: number
  title: string
  clientId: number | null
  assigneeEmail: string | null
  sourceNoteId: number | null
  decidedByEmail: string
  decidedAt: string
}

export async function persistActionItemPlan(
  plan: ActionItemPlan,
  deps: PersistActionItemDeps
): Promise<{ tasksCreated: number; proposalsCreated: number }> {
  let tasksCreated = 0
  for (const task of plan.autoCreates) {
    const created = await deps.createTask(
      {
        title: task.title,
        clientId: task.clientId,
        description: task.description,
        mbaNumber: task.mbaNumber,
        assigneeEmail: task.assigneeEmail,
        assigneeName: task.assigneeName,
        category: task.category,
        source: "ava",
        sourceNoteId: task.sourceNoteId,
        autoCreated: task.autoCreated,
        avaAutoKey: task.avaAutoKey,
        createdByEmail: task.createdByEmail,
      },
      task.createdByEmail,
      "ava"
    )
    if (created.id > 0) tasksCreated += 1
  }
  if (plan.proposals.length > 0) {
    await deps.insertProposals(plan.proposals)
  }
  return { tasksCreated, proposalsCreated: plan.proposals.length }
}

export async function dismissAutoCreatedPure(
  input: { taskId: number; decidedByEmail: string },
  deps: {
    getTask: () => Promise<{
      id: number
      autoCreated: boolean
      deletedAt: string | null
      title: string
      clientId: number | null
      assigneeEmail: string | null
      sourceNoteId: number | null
    } | null>
    softDelete: () => Promise<boolean>
    recordDismissal: (row: DismissalSignal) => Promise<void>
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await deps.getTask()
  if (!task) return { ok: false, error: "not_found" }
  if (!task.autoCreated) return { ok: false, error: "not_auto_created" }
  if (task.deletedAt) return { ok: false, error: "already_deleted" }

  const deleted = await deps.softDelete()
  if (!deleted) return { ok: false, error: "not_found" }

  const decidedBy = input.decidedByEmail.trim().toLowerCase()
  const decidedAt = new Date().toISOString()
  await deps.recordDismissal({
    action: "auto_created_dismiss",
    taskId: task.id,
    title: task.title,
    clientId: task.clientId,
    assigneeEmail: task.assigneeEmail,
    sourceNoteId: task.sourceNoteId,
    decidedByEmail: decidedBy,
    decidedAt,
  })
  return { ok: true }
}
