/**
 * Publisher Hub meetings: client_notes attributed to this catalogue publisher.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { selectPublisherMeetings } from "../selectPublisherMeetings"

const QMS_ID = 30
const SCA_ID = 12

function note(
  over: Partial<{
    id: number
    publisherId: number | null
    attributedType: string | null
    title: string | null
    meetingDate: string | null
    durationSeconds: number | null
    transcriptUrl: string | null
  }>,
) {
  return {
    id: 1,
    publisherId: QMS_ID,
    attributedType: "publisher" as string | null,
    title: "QMS Q1",
    meetingDate: "2026-03-01T00:00:00.000Z",
    durationSeconds: 1800,
    transcriptUrl: "https://app.fireflies.ai/view/qms",
    ...over,
  }
}

test("keeps publisher-attributed notes for this publisher_id only", () => {
  const rows = [
    note({ id: 1, title: "QMS keep" }),
    note({ id: 2, publisherId: SCA_ID, title: "SCA other" }),
    note({ id: 3, attributedType: "client", title: "client attributed" }),
    note({ id: 4, attributedType: null, title: "unattributed" }),
    note({ id: 5, publisherId: null, title: "no publisher" }),
  ]
  const out = selectPublisherMeetings(rows, QMS_ID)
  assert.deepEqual(
    out.map((m) => m.title),
    ["QMS keep"],
  )
  assert.equal(out[0]!.transcript_url, "https://app.fireflies.ai/view/qms")
  assert.equal(out[0]!.duration_seconds, 1800)
})

test("newest meeting_date first, then higher id", () => {
  const rows = [
    note({ id: 10, title: "older", meetingDate: "2026-01-01T00:00:00.000Z" }),
    note({ id: 11, title: "newer", meetingDate: "2026-04-01T00:00:00.000Z" }),
    note({ id: 12, title: "same-day-later-id", meetingDate: "2026-04-01T00:00:00.000Z" }),
  ]
  const out = selectPublisherMeetings(rows, QMS_ID)
  assert.deepEqual(
    out.map((m) => m.title),
    ["same-day-later-id", "newer", "older"],
  )
})
