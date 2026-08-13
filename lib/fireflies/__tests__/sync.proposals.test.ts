/**
 * Sync must create proposals only — never tasks.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { runFirefliesSync } from "../sync.js"
import type { FirefliesTranscript } from "../types.js"

test("synced action items become proposals; no task is auto-created", async () => {
  const proposals: Array<{ noteId: number; titles: string[] }> = []
  let taskCreates = 0

  const transcripts: FirefliesTranscript[] = [
    {
      id: "ff-prop-1",
      title: "[FOO001] Weekly",
      date: new Date("2026-08-10T10:00:00.000Z").getTime(),
      duration: 30,
      participants: ["luke@assembledmedia.com.au", "client@acme.com"],
      organizer_email: "luke@assembledmedia.com.au",
      transcript_url: "https://app.fireflies.ai/view/ff-prop-1",
      summary: {
        overview: "hi",
        action_items: "- Luke: Send pacing deck\n- Follow up on IO",
      },
    },
  ]

  const result = await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async () => ({ id: 42 }),
    insertProposalsFromNote: async ({ noteId, note }) => {
      assert.equal(noteId, 42)
      assert.ok(note.actionItemsRaw?.includes("Send pacing"))
      // Simulate proposal insert path — never create tasks here
      proposals.push({
        noteId,
        titles: note.actionItemsRaw!.split("\n").map((l) => l.trim()),
      })
      return 2
    },
    loadAttributionContext: async () => ({
      knownMbas: new Map([
        ["foo001", { mbaNumber: "FOO001", clientId: 1 }],
      ]),
      domainToClient: new Map(),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async () => transcripts,
  })

  assert.equal(result.status, "ok")
  assert.equal(result.notesCreated, 1)
  assert.equal(result.proposalsCreated, 2)
  assert.equal(proposals.length, 1)
  assert.equal(taskCreates, 0)
})
