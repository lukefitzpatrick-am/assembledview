import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MyHoursUser } from "../client.js"
import type { OverlapEntry } from "../overlap.js"
import {
  confirmTimeEntryProposal,
  skipTimeEntryProposal,
  type ConfirmDeps,
  type TimeEntryProposal,
  type TimeEntryProposalPatch,
} from "../timeEntryProposals.js"

const proposal: TimeEntryProposal = {
  id: 8,
  sourceNoteId: 21,
  memberEmail: "luke@assembledmedia.com.au",
  entryDate: "2026-08-13",
  durationMinutes: 60,
  note: "Weekly sync (Fireflies)",
  clientId: 7,
  mbaNumber: "foo001",
  myhoursProjectId: null,
  myhoursTaskId: null,
  myhoursLogId: null,
  meetingStartIso: null,
  status: "proposed",
  blockReason: null,
}

function makeDeps(overrides: Partial<ConfirmDeps> = {}) {
  const writes: Array<{ input: unknown }> = []
  const patches: TimeEntryProposalPatch[] = []
  const users: MyHoursUser[] = [
    { id: 55, email: "LUKE@assembledmedia.com.au" },
  ]
  const entries: OverlapEntry[] = []

  const deps: ConfirmDeps = {
    loadProposal: async () => ({ ...proposal }),
    listUsers: async () => users,
    ensureStructure: async () => ({
      ok: true,
      projectId: "101",
      taskId: "202",
    }),
    listSameDayEntries: async () => entries,
    createTimeLog: async (input) => {
      writes.push({ input })
      return { id: 909 }
    },
    updateProposal: async (_id, patch) => {
      patches.push(patch)
    },
    now: () => "2026-08-13T02:00:00.000Z",
    ...overrides,
  }
  return { deps, writes, patches, users, entries }
}

describe("confirmTimeEntryProposal", () => {
  it("confirms a proposal and creates exactly one MyHours time log", async () => {
    const { deps, writes, patches } = makeDeps()

    const result = await confirmTimeEntryProposal(
      proposal.id,
      " Actor@Example.com ",
      deps
    )

    assert.deepEqual(result, {
      status: "confirmed",
      myhoursLogId: "909",
    })
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0]!.input, {
      date: "2026-08-13",
      duration: 3600,
      note: proposal.note,
      projectId: 101,
      taskId: 202,
      userId: 55,
    })
    assert.deepEqual(patches.at(-1), {
      status: "confirmed",
      blockReason: null,
      myhoursProjectId: "101",
      myhoursTaskId: "202",
      myhoursLogId: "909",
      confirmedByEmail: "actor@example.com",
      confirmedAt: "2026-08-13T02:00:00.000Z",
      updatedAt: "2026-08-13T02:00:00.000Z",
    })
  })

  it("blocks a note-match overlap without writing to MyHours", async () => {
    const { deps, writes, patches, entries } = makeDeps()
    entries.push({
      myhoursLogId: "700",
      memberEmail: proposal.memberEmail,
      entryDate: proposal.entryDate,
      note: proposal.note,
      durationMinutes: 60,
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.equal(result.status, "blocked_overlap")
    assert.match(result.blockReason ?? "", /existing time entry/)
    assert.equal(writes.length, 0)
    assert.equal(patches.at(-1)?.status, "blocked_overlap")
  })

  it("does not create a second log when the linked log is already mirrored", async () => {
    const { deps, writes, entries } = makeDeps({
      loadProposal: async () => ({ ...proposal, myhoursLogId: "700" }),
    })
    entries.push({
      myhoursLogId: "700",
      memberEmail: proposal.memberEmail,
      entryDate: proposal.entryDate,
      note: "Different note",
      durationMinutes: 60,
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.equal(result.status, "blocked_overlap")
    assert.match(result.blockReason ?? "", /already linked/)
    assert.equal(writes.length, 0)
  })

  it("allows a same-day entry with a different note", async () => {
    const { deps, writes, entries } = makeDeps()
    entries.push({
      myhoursLogId: "701",
      memberEmail: proposal.memberEmail,
      entryDate: proposal.entryDate,
      note: "Admin catch-up",
      durationMinutes: 30,
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.equal(result.status, "confirmed")
    assert.equal(writes.length, 1)
  })

  it("uses structure resolved at confirmation time", async () => {
    const { deps, writes } = makeDeps({
      loadProposal: async () => ({
        ...proposal,
        myhoursProjectId: null,
        myhoursTaskId: null,
      }),
      ensureStructure: async () => ({
        ok: true,
        projectId: "303",
        taskId: "404",
      }),
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.equal(result.status, "confirmed")
    assert.deepEqual(writes[0]!.input, {
      date: proposal.entryDate,
      duration: 3600,
      note: proposal.note,
      projectId: 303,
      taskId: 404,
      userId: 55,
    })
  })

  it("re-confirms a blocked proposal after its conflict clears", async () => {
    const { deps, writes } = makeDeps({
      loadProposal: async () => ({
        ...proposal,
        status: "blocked_overlap",
        blockReason: "old conflict",
      }),
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.equal(result.status, "confirmed")
    assert.equal(writes.length, 1)
  })

  it("blocks when the proposal member has no MyHours user", async () => {
    const { deps, writes, patches } = makeDeps({ listUsers: async () => [] })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.deepEqual(result, {
      status: "blocked_structure",
      blockReason: `no MyHours user for ${proposal.memberEmail}`,
    })
    assert.equal(writes.length, 0)
    assert.equal(patches.at(-1)?.blockReason, result.blockReason)
  })

  it("blocks when ensure does not produce a campaign task", async () => {
    const { deps, writes } = makeDeps({
      ensureStructure: async () => ({
        ok: true,
        projectId: "101",
        taskId: null,
      }),
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.deepEqual(result, {
      status: "blocked_structure",
      blockReason: `no MyHours task for ${proposal.mbaNumber}`,
    })
    assert.equal(writes.length, 0)
  })

  it("uses the structure failure reason returned by ensure", async () => {
    const { deps, writes } = makeDeps({
      ensureStructure: async () => ({
        ok: false,
        reason: "MyHours project creation is disabled",
      }),
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.deepEqual(result, {
      status: "blocked_structure",
      blockReason: "MyHours project creation is disabled",
    })
    assert.equal(writes.length, 0)
  })

  it("uses client-only wording when the proposal has no MBA", async () => {
    const { deps, writes } = makeDeps({
      loadProposal: async () => ({ ...proposal, mbaNumber: null }),
      ensureStructure: async () => ({
        ok: true,
        projectId: "101",
        taskId: null,
      }),
    })

    const result = await confirmTimeEntryProposal(proposal.id, "actor@example.com", deps)

    assert.deepEqual(result, {
      status: "blocked_structure",
      blockReason: "no MyHours task for client",
    })
    assert.equal(writes.length, 0)
  })

  it("rejects proposals that already have a terminal decision", async () => {
    const { deps, writes } = makeDeps({
      loadProposal: async () => ({ ...proposal, status: "confirmed" }),
    })

    await assert.rejects(
      confirmTimeEntryProposal(proposal.id, "actor@example.com", deps),
      /already confirmed/
    )
    assert.equal(writes.length, 0)
  })
})

describe("skipTimeEntryProposal", () => {
  it("marks a proposal skipped without creating a MyHours log", async () => {
    const { deps, writes, patches } = makeDeps()

    const result = await skipTimeEntryProposal(proposal.id, " Actor@Example.com ", deps)

    assert.deepEqual(result, { status: "skipped" })
    assert.equal(writes.length, 0)
    assert.deepEqual(patches, [
      {
        status: "skipped",
        blockReason: null,
        confirmedByEmail: "actor@example.com",
        confirmedAt: "2026-08-13T02:00:00.000Z",
        updatedAt: "2026-08-13T02:00:00.000Z",
      },
    ])
  })
})
