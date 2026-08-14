/**
 * Client hub meetings: client_notes for this client_id, newest first.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  noteHasAutoCreatedTasks,
  selectClientMeetings,
} from "../selectClientMeetings"

const CLIENT_A = 77
const CLIENT_B = 88

function note(
  over: Partial<{
    id: number
    clientId: number | null
    title: string | null
    meetingDate: string | null
    durationSeconds: number | null
    transcriptUrl: string | null
    body: string | null
  }>,
) {
  return {
    id: 1,
    clientId: CLIENT_A,
    title: "WIP",
    meetingDate: "2026-03-01T00:00:00.000Z",
    durationSeconds: 1800,
    transcriptUrl: "https://app.fireflies.ai/view/wip",
    body: JSON.stringify({ summary: "Talked budget." }),
    ...over,
  }
}

test("keeps notes for this client_id only", () => {
  const rows = [
    note({ id: 1, title: "keep" }),
    note({ id: 2, clientId: CLIENT_B, title: "other client" }),
    note({ id: 3, clientId: null, title: "unattributed" }),
  ]
  const out = selectClientMeetings(rows, CLIENT_A)
  assert.deepEqual(
    out.map((m) => m.title),
    ["keep"],
  )
  assert.equal(out[0]!.transcript_url, "https://app.fireflies.ai/view/wip")
  assert.equal(out[0]!.duration_seconds, 1800)
  assert.equal(out[0]!.summary, "Talked budget.")
})

test("newest meeting_date first, then higher id", () => {
  const rows = [
    note({ id: 10, title: "older", meetingDate: "2026-01-01T00:00:00.000Z" }),
    note({ id: 11, title: "newer", meetingDate: "2026-04-01T00:00:00.000Z" }),
    note({
      id: 12,
      title: "same-day-later-id",
      meetingDate: "2026-04-01T00:00:00.000Z",
    }),
  ]
  const out = selectClientMeetings(rows, CLIENT_A)
  assert.deepEqual(
    out.map((m) => m.title),
    ["same-day-later-id", "newer", "older"],
  )
})

test("auto-created task badge is per note id", () => {
  assert.equal(
    noteHasAutoCreatedTasks(1, [
      { sourceNoteId: 1, autoCreated: true, deletedAt: null },
      { sourceNoteId: 2, autoCreated: true, deletedAt: null },
    ]),
    true,
  )
  assert.equal(
    noteHasAutoCreatedTasks(2, [
      { sourceNoteId: 1, autoCreated: true, deletedAt: null },
    ]),
    false,
  )
  assert.equal(
    noteHasAutoCreatedTasks(1, [
      { sourceNoteId: 1, autoCreated: true, deletedAt: "2026-08-01T00:00:00Z" },
    ]),
    false,
  )
})
