/**
 * Accept / dismiss ava_task_proposals — human-only task creation.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { isPossibleDuplicate } from "../actionItems.js"
import {
  acceptProposalPure,
  dismissProposalPure,
  type ProposalRow,
} from "../proposals.js"

function baseProposal(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: 1,
    sourceNoteId: 10,
    clientId: 5,
    proposedTitle: "Send pacing deck",
    proposedDescription: "From meeting\n> Send pacing deck",
    proposedCategory: "meeting_followup",
    proposedDueDate: null,
    proposedAssigneeEmail: "luke@assembledmedia.com.au",
    proposedMbaNumber: "FOO001",
    status: "proposed",
    decidedByEmail: null,
    decidedAt: null,
    createdTaskId: null,
    ...over,
  }
}

test("accept round-trip: creates task with source ava + activity actor ava", async () => {
  const created: unknown[] = []
  const activity: unknown[] = []
  const proposal = baseProposal()

  const result = await acceptProposalPure(
    {
      proposalId: 1,
      decidedByEmail: "admin@assembledmedia.com.au",
      edits: null,
    },
    {
      getProposal: async () => proposal,
      createTask: async (input, actorEmail, actorKind) => {
        created.push({ input, actorEmail, actorKind })
        return { id: 99, title: input.title }
      },
      markAccepted: async (id, patch) => {
        proposal.status = patch.status
        proposal.createdTaskId = patch.createdTaskId
        proposal.decidedByEmail = patch.decidedByEmail
        proposal.decidedAt = patch.decidedAt
        activity.push({ id, patch })
      },
      listOpenTasksForMba: async () => [],
    }
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.taskId, 99)
  assert.equal(created.length, 1)
  const c = created[0] as {
    input: { source: string; title: string; sourceNoteId?: number }
    actorKind: string
  }
  assert.equal(c.input.source, "ava")
  assert.equal(c.actorKind, "ava")
  assert.equal(c.input.title, "Send pacing deck")
  assert.equal(proposal.status, "accepted")
  assert.equal(proposal.createdTaskId, 99)
})

test("dismiss persists status + who + when (no task created)", async () => {
  const proposal = baseProposal()
  let taskCalls = 0

  const result = await dismissProposalPure(
    {
      proposalId: 1,
      decidedByEmail: "admin@assembledmedia.com.au",
    },
    {
      getProposal: async () => proposal,
      createTask: async () => {
        taskCalls += 1
        throw new Error("must not create")
      },
      markDismissed: async (_id, patch) => {
        proposal.status = patch.status
        proposal.decidedByEmail = patch.decidedByEmail
        proposal.decidedAt = patch.decidedAt
        proposal.decisionDiff = patch.decisionDiff
      },
    }
  )

  assert.equal(result.ok, true)
  assert.equal(taskCalls, 0)
  assert.equal(proposal.status, "rejected")
  assert.equal(proposal.decidedByEmail, "admin@assembledmedia.com.au")
  assert.ok(proposal.decidedAt)
})

test("duplicate flag: same title+MBA open task is flagged, not dropped", () => {
  const flagged = isPossibleDuplicate("Send pacing deck", "FOO001", [
    { title: "send pacing deck", mbaNumber: "FOO001" },
  ])
  assert.equal(flagged, true)
})

test("no path creates a task without human accept (dismiss / list only)", async () => {
  let taskCalls = 0
  const proposal = baseProposal()
  await dismissProposalPure(
    { proposalId: 1, decidedByEmail: "a@x.com" },
    {
      getProposal: async () => proposal,
      createTask: async () => {
        taskCalls += 1
        return { id: 1, title: "x" }
      },
      markDismissed: async () => {},
    }
  )
  assert.equal(taskCalls, 0)
})
