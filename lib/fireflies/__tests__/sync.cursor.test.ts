import assert from "node:assert/strict"
import { test } from "node:test"

import { runFirefliesSync } from "../sync.js"
import type { FirefliesTranscript } from "../types.js"

function makeTranscript(
  id: string,
  dateIso: string,
  title = "Meeting"
): FirefliesTranscript {
  return {
    id,
    title,
    date: new Date(dateIso).getTime(),
    duration: 30,
    participants: ["a@assembledmedia.com.au"],
    organizer_email: "a@assembledmedia.com.au",
    transcript_url: `https://app.fireflies.ai/view/${id}`,
    summary: { overview: "hi", action_items: "- do thing" },
  }
}

test("cursor idempotency: re-run pulls nothing new (skips existing ids)", async () => {
  const store = {
    existingIds: new Set<string>(),
    inserted: [] as string[],
    cursor: null as string | null,
    runs: [] as Array<{ notesCreated: number; notesSkipped: number }>,
  }

  const transcripts = [
    makeTranscript("ff-1", "2026-08-10T10:00:00.000Z", "[FOO001] A"),
    makeTranscript("ff-2", "2026-08-11T10:00:00.000Z", "[FOO001] B"),
  ]

  let listCalls = 0

  const deps = {
    getApiKey: () => "test-key",
    loadCursor: async () => store.cursor,
    saveRun: async (row: {
      cursorFrom: string | null
      notesCreated: number
      notesSkipped: number
      status: string
    }) => {
      store.cursor = row.cursorFrom
      store.runs.push({
        notesCreated: row.notesCreated,
        notesSkipped: row.notesSkipped,
      })
    },
    hasMeeting: async (id: string) => store.existingIds.has(id),
    insertNote: async (note: { firefliesMeetingId: string }) => {
      store.existingIds.add(note.firefliesMeetingId)
      store.inserted.push(note.firefliesMeetingId)
      return { id: store.inserted.length }
    },
    loadAttributionContext: async () => ({
      knownMbas: new Map([
        ["foo001", { mbaNumber: "FOO001", clientId: 1 }],
      ]),
      domainToClient: new Map<string, number>(),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async () => {
      listCalls += 1
      return transcripts
    },
  }

  const first = await runFirefliesSync(deps)
  assert.equal(first.notesCreated, 2)
  assert.equal(first.notesSkipped, 0)
  assert.equal(store.inserted.length, 2)
  assert.ok(store.cursor)

  const second = await runFirefliesSync(deps)
  assert.equal(second.notesCreated, 0)
  assert.equal(second.notesSkipped, 2)
  assert.equal(store.inserted.length, 2)
  assert.equal(listCalls, 2)
})
