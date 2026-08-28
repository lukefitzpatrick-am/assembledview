import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildTimeEntryDraftRows,
  isRefreshableTimeEntryProposalStatus,
} from "../timeEntryDrafts.js"
import type { TeamMemberIdentity } from "../rosterAliases.js"
import { runFirefliesSync, type SyncInsertNote } from "../sync.js"
import type { FirefliesTranscript } from "../types.js"

function note(overrides: Partial<SyncInsertNote> = {}): SyncInsertNote {
  return {
    firefliesMeetingId: "ff-draft-1",
    clientId: 7,
    mbaNumber: "foo001",
    source: "fireflies",
    title: "Weekly status",
    body: "{}",
    meetingDate: "2026-08-10T23:30:00.000Z",
    participants: JSON.stringify([
      "LUKE@ASSEMBLEDMEDIA.COM.AU",
      "client@example.com",
    ]),
    organizerEmail: "luke@assembledmedia.com.au",
    matchedBy: "mba",
    durationSeconds: 1_830,
    transcriptUrl: null,
    isInternal: false,
    actionItemsRaw: null,
    ...overrides,
  }
}

test("roster miss creates no time-entry draft", () => {
  const rows = buildTimeEntryDraftRows({
    noteId: 41,
    note: note(),
    activeMemberEmails: ["someone.else@assembledmedia.com.au"],
  })

  assert.deepEqual(rows, [])
})

test("internal meeting creates no time-entry draft", () => {
  const rows = buildTimeEntryDraftRows({
    noteId: 41,
    note: note({ clientId: null, isInternal: true }),
    activeMemberEmails: ["luke@assembledmedia.com.au"],
  })

  assert.deepEqual(rows, [])
})

test("client-attributed roster attendee creates a normalized draft", () => {
  const rows = buildTimeEntryDraftRows({
    noteId: 41,
    note: note(),
    activeMemberEmails: [
      " Luke@AssembledMedia.com.au ",
      "luke@assembledmedia.com.au",
    ],
  })

  assert.deepEqual(rows, [
    {
      sourceNoteId: 41,
      memberEmail: "luke@assembledmedia.com.au",
      entryDate: "2026-08-11",
      durationMinutes: 31,
      note: "Weekly status (Fireflies)",
      clientId: 7,
      mbaNumber: "foo001",
    },
  ])
})

test("confirmed and skipped proposals are terminal", () => {
  assert.equal(isRefreshableTimeEntryProposalStatus("confirmed"), false)
  assert.equal(isRefreshableTimeEntryProposalStatus("skipped"), false)
  assert.equal(isRefreshableTimeEntryProposalStatus("proposed"), true)
  assert.equal(isRefreshableTimeEntryProposalStatus("blocked_overlap"), true)
  assert.equal(isRefreshableTimeEntryProposalStatus("blocked_structure"), true)
})

const SAMANTHA_KEAH: TeamMemberIdentity = {
  canonicalEmail: "samantha.keah@assembledmedia.com.au",
  name: "Samantha Keah",
  aliases: ["samantha@assembledmedia.com.au"],
}

const SAMANTHA_MURPHY: TeamMemberIdentity = {
  canonicalEmail: "samantha.murphy@assembledmedia.com.au",
  name: "Samantha Murphy",
  aliases: ["samantha@assembledmedia.com.au"],
}

test("unique alias attendee drafts against the canonical roster email", () => {
  const rows = buildTimeEntryDraftRows({
    noteId: 41,
    note: note({
      participants: JSON.stringify(["samantha@assembledmedia.com.au"]),
    }),
    activeMemberEmails: [SAMANTHA_KEAH.canonicalEmail],
    roster: [SAMANTHA_KEAH],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.memberEmail, SAMANTHA_KEAH.canonicalEmail)
})

test("colliding alias attendee creates no time-entry draft", () => {
  const rows = buildTimeEntryDraftRows({
    noteId: 41,
    note: note({
      participants: JSON.stringify(["samantha@assembledmedia.com.au"]),
    }),
    activeMemberEmails: [
      SAMANTHA_KEAH.canonicalEmail,
      SAMANTHA_MURPHY.canonicalEmail,
    ],
    roster: [SAMANTHA_KEAH, SAMANTHA_MURPHY],
  })
  assert.deepEqual(rows, [])
})

test("meeting UTC instant uses the Sydney civil date", () => {
  const [row] = buildTimeEntryDraftRows({
    noteId: 42,
    note: note({ meetingDate: "2026-08-10T14:01:00.000Z" }),
    activeMemberEmails: ["luke@assembledmedia.com.au"],
  })

  assert.equal(row?.entryDate, "2026-08-11")
})

test("sync invokes draft upsert after inserting a client-attributed note", async () => {
  const calls: Array<{ noteId: number; activeMemberEmails: readonly string[] }> = []
  const transcript: FirefliesTranscript = {
    id: "ff-draft-sync",
    title: "[FOO001] Weekly",
    date: new Date("2026-08-10T23:30:00.000Z").getTime(),
    duration: 30,
    participants: ["luke@assembledmedia.com.au", "client@example.com"],
    organizer_email: "luke@assembledmedia.com.au",
    transcript_url: null,
    summary: { overview: "hi", action_items: null },
  }

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async () => ({ id: 91 }),
    activeMemberEmails: ["luke@assembledmedia.com.au"],
    upsertTimeEntryDraftsForNote: async (args) => {
      calls.push({
        noteId: args.noteId,
        activeMemberEmails: args.activeMemberEmails,
      })
      return 1
    },
    loadAttributionContext: async () => ({
      knownMbas: new Map([
        ["foo001", { mbaNumber: "FOO001", clientId: 7 }],
      ]),
      domainToClient: new Map([["example.com", 7]]),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async () => [transcript],
  })

  assert.deepEqual(calls, [
    {
      noteId: 91,
      activeMemberEmails: ["luke@assembledmedia.com.au"],
    },
  ])
})

test("re-sync creates missing drafts for an existing client-attributed note", async () => {
  const calls: Array<{ noteId: number; note: SyncInsertNote }> = []
  let insertCalls = 0
  const existingNote = note({
    firefliesMeetingId: "ff-existing-draft",
    title: "Existing client meeting",
  })

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => ({
      id: 92,
      note: existingNote,
    }),
    insertNote: async () => {
      insertCalls += 1
      return { id: 999 }
    },
    activeMemberEmails: ["luke@assembledmedia.com.au"],
    upsertTimeEntryDraftsForNote: async (args) => {
      calls.push({ noteId: args.noteId, note: args.note })
      return 1
    },
    loadAttributionContext: async () => ({
      knownMbas: new Map(),
      domainToClient: new Map(),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async () => [
      {
        id: "ff-existing-draft",
        title: "Existing client meeting",
        date: new Date("2026-08-10T23:30:00.000Z").getTime(),
        duration: 30,
        participants: ["luke@assembledmedia.com.au"],
        organizer_email: "luke@assembledmedia.com.au",
        transcript_url: null,
        summary: { overview: "hi", action_items: null },
      },
    ],
  })

  assert.equal(insertCalls, 0)
  assert.deepEqual(calls, [{ noteId: 92, note: existingNote }])
})
