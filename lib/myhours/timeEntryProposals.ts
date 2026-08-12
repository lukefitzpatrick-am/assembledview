import type { TimeEntryProposalStatus } from "@/db/schema/myhours"
import type {
  CreateMyHoursTimeLogInput,
  MyHoursTimeLog,
  MyHoursUser,
} from "./client.js"
import {
  checkTimeEntryOverlap,
  type OverlapEntry,
  type OverlapProposal,
} from "./overlap.js"

export type TimeEntryProposal = {
  id: number
  sourceNoteId: number
  memberEmail: string
  entryDate: string
  durationMinutes: number
  note: string
  clientId: number | null
  mbaNumber: string | null
  myhoursProjectId: string | null
  myhoursTaskId: string | null
  myhoursLogId: string | null
  meetingStartIso: string | null
  status: TimeEntryProposalStatus
  blockReason: string | null
}

export type TimeEntryProposalPatch = {
  status: TimeEntryProposalStatus
  blockReason?: string | null
  myhoursProjectId?: string | null
  myhoursTaskId?: string | null
  myhoursLogId?: string | null
  confirmedByEmail?: string | null
  confirmedAt?: string | null
  updatedAt: string
}

export type EnsureProposalStructureResult =
  | { ok: true; projectId: string; taskId: string | null }
  | { ok: false; reason: string }

export type SkipDeps = {
  loadProposal: (proposalId: number) => Promise<TimeEntryProposal | null>
  updateProposal: (
    proposalId: number,
    patch: TimeEntryProposalPatch
  ) => Promise<void>
  now?: () => string
}

export type ConfirmDeps = SkipDeps & {
  listUsers: () => Promise<MyHoursUser[]>
  ensureStructure: (
    proposal: TimeEntryProposal
  ) => Promise<EnsureProposalStructureResult>
  listSameDayEntries: (
    memberEmail: string,
    entryDate: string
  ) => Promise<OverlapEntry[]>
  createTimeLog: (
    input: CreateMyHoursTimeLogInput
  ) => Promise<MyHoursTimeLog>
}

export type ConfirmProposalResult = {
  status: string
  blockReason?: string
  myhoursLogId?: string
}

const TERMINAL_STATUSES = new Set<TimeEntryProposalStatus>([
  "confirmed",
  "skipped",
])

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}

async function loadDecidableProposal(
  proposalId: number,
  deps: SkipDeps
): Promise<TimeEntryProposal> {
  const proposal = await deps.loadProposal(proposalId)
  if (!proposal) throw new Error(`time-entry proposal ${proposalId} not found`)
  if (TERMINAL_STATUSES.has(proposal.status)) {
    throw new Error(`time-entry proposal ${proposalId} already ${proposal.status}`)
  }
  return proposal
}

async function persistBlock(
  proposal: TimeEntryProposal,
  status: "blocked_overlap" | "blocked_structure",
  blockReason: string,
  deps: ConfirmDeps,
  structure?: { projectId: string; taskId: string | null }
): Promise<ConfirmProposalResult> {
  const updatedAt = (deps.now ?? (() => new Date().toISOString()))()
  await deps.updateProposal(proposal.id, {
    status,
    blockReason,
    ...(structure
      ? {
          myhoursProjectId: structure.projectId,
          myhoursTaskId: structure.taskId,
        }
      : {}),
    updatedAt,
  })
  return { status, blockReason }
}

export async function confirmTimeEntryProposal(
  proposalId: number,
  actorEmail: string,
  deps: ConfirmDeps
): Promise<ConfirmProposalResult> {
  const proposal = await loadDecidableProposal(proposalId, deps)
  const memberEmail = normaliseEmail(proposal.memberEmail)
  const users = await deps.listUsers()
  const user = users.find(
    (candidate) =>
      candidate.email != null &&
      normaliseEmail(candidate.email) === memberEmail
  )

  if (!user) {
    return persistBlock(
      proposal,
      "blocked_structure",
      `no MyHours user for ${proposal.memberEmail}`,
      deps
    )
  }

  const structure = await deps.ensureStructure(proposal)
  if (!structure.ok || structure.taskId == null) {
    return persistBlock(
      proposal,
      "blocked_structure",
      `no MyHours task for ${proposal.mbaNumber}`,
      deps,
      structure.ok ? structure : undefined
    )
  }

  const sameDayEntries = await deps.listSameDayEntries(
    memberEmail,
    proposal.entryDate
  )
  const overlapProposal: OverlapProposal = {
    memberEmail,
    entryDate: proposal.entryDate,
    note: proposal.note,
    myhoursLogId: proposal.myhoursLogId,
    meetingStartIso: proposal.meetingStartIso,
    durationMinutes: proposal.durationMinutes,
  }
  const overlap = checkTimeEntryOverlap(overlapProposal, sameDayEntries)
  if (overlap.blocked) {
    return persistBlock(
      proposal,
      "blocked_overlap",
      overlap.reason,
      deps,
      structure
    )
  }

  const projectId = Number(structure.projectId)
  const taskId = Number(structure.taskId)
  if (!Number.isFinite(projectId) || !Number.isFinite(taskId)) {
    return persistBlock(
      proposal,
      "blocked_structure",
      `no MyHours task for ${proposal.mbaNumber}`,
      deps,
      structure
    )
  }

  const created = await deps.createTimeLog({
    date: proposal.entryDate,
    duration: proposal.durationMinutes * 60,
    note: proposal.note,
    projectId,
    taskId,
    userId: user.id,
  })
  const myhoursLogId = String(created.id)
  const now = (deps.now ?? (() => new Date().toISOString()))()
  await deps.updateProposal(proposal.id, {
    status: "confirmed",
    blockReason: null,
    myhoursProjectId: structure.projectId,
    myhoursTaskId: structure.taskId,
    myhoursLogId,
    confirmedByEmail: normaliseEmail(actorEmail),
    confirmedAt: now,
    updatedAt: now,
  })

  return { status: "confirmed", myhoursLogId }
}

export async function skipTimeEntryProposal(
  proposalId: number,
  actorEmail: string,
  deps: SkipDeps
): Promise<{ status: "skipped" }> {
  const proposal = await loadDecidableProposal(proposalId, deps)
  const now = (deps.now ?? (() => new Date().toISOString()))()
  await deps.updateProposal(proposal.id, {
    status: "skipped",
    blockReason: null,
    confirmedByEmail: normaliseEmail(actorEmail),
    confirmedAt: now,
    updatedAt: now,
  })
  return { status: "skipped" }
}
