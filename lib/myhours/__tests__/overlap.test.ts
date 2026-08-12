import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  checkTimeEntryOverlap,
  intervalFromRaw,
  type OverlapEntry,
  type OverlapProposal,
} from "../overlap.js"

const baseProposal: OverlapProposal = {
  memberEmail: "luke@assembledmedia.com.au",
  entryDate: "2026-08-13",
  note: "Weekly sync (Fireflies)",
  myhoursLogId: null,
  meetingStartIso: null,
  durationMinutes: 60,
}

function entry(overrides: Partial<OverlapEntry> = {}): OverlapEntry {
  return {
    myhoursLogId: "100",
    memberEmail: baseProposal.memberEmail,
    entryDate: baseProposal.entryDate,
    note: null,
    durationMinutes: 30,
    ...overrides,
  }
}

describe("intervalFromRaw", () => {
  it("parses top-level startTime/endTime on activity row", () => {
    const interval = intervalFromRaw(
      {
        startTime: "2026-08-13T01:00:00.000Z",
        endTime: "2026-08-13T02:00:00.000Z",
      },
      "2026-08-13",
      60
    )
    assert.ok(interval)
    assert.equal(interval!.startMs, Date.parse("2026-08-13T01:00:00.000Z"))
    assert.equal(interval!.endMs, Date.parse("2026-08-13T02:00:00.000Z"))
  })

  it("parses nested startTime/endTime", () => {
    const interval = intervalFromRaw(
      {
        activity: {
          startTime: "2026-08-13T03:00:00.000Z",
          endTime: "2026-08-13T04:00:00.000Z",
        },
      },
      "2026-08-13",
      60
    )
    assert.ok(interval)
    assert.equal(interval!.startMs, Date.parse("2026-08-13T03:00:00.000Z"))
    assert.equal(interval!.endMs, Date.parse("2026-08-13T04:00:00.000Z"))
  })

  it("derives end from start + durationMinutes when endTime missing", () => {
    const interval = intervalFromRaw(
      { startTime: "2026-08-13T05:00:00.000Z" },
      "2026-08-13",
      45
    )
    assert.ok(interval)
    assert.equal(interval!.endMs - interval!.startMs, 45 * 60 * 1000)
  })

  it("anchors offset-less timestamps to Australia/Sydney", () => {
    const previousTz = process.env.TZ
    process.env.TZ = "UTC"
    try {
      const interval = intervalFromRaw(
        {
          startTime: "2026-08-13T09:00:00",
          endTime: "2026-08-13T10:00:00",
        },
        "2026-08-13",
        60
      )

      assert.ok(interval)
      assert.equal(interval!.startMs, Date.parse("2026-08-13T09:00:00+10:00"))
      assert.equal(interval!.endMs, Date.parse("2026-08-13T10:00:00+10:00"))
    } finally {
      process.env.TZ = previousTz
    }
  })

  it("returns null when raw has no parseable start", () => {
    assert.equal(intervalFromRaw({ note: "manual" }, "2026-08-13", 30), null)
    assert.equal(intervalFromRaw(null, "2026-08-13", 30), null)
  })
})

describe("checkTimeEntryOverlap", () => {
  it("tier-1 blocks on same-day note match", () => {
    const hit = checkTimeEntryOverlap(baseProposal, [
      entry({ note: "Weekly sync (Fireflies)", myhoursLogId: "200" }),
    ])
    assert.equal(hit.blocked, true)
    if (hit.blocked) {
      assert.match(hit.reason, /Weekly sync \(Fireflies\)/)
    }
  })

  it("tier-1 blocks when proposal myhours_log_id already exists on mirror", () => {
    const hit = checkTimeEntryOverlap(
      { ...baseProposal, myhoursLogId: "555", note: "Other draft note" },
      [entry({ myhoursLogId: "555", note: "Different logged note" })]
    )
    assert.equal(hit.blocked, true)
    if (hit.blocked) {
      assert.match(hit.reason, /555/)
    }
  })

  it("same-day different note is not blocked without window overlap", () => {
    const hit = checkTimeEntryOverlap(baseProposal, [
      entry({ note: "Admin catch-up", myhoursLogId: "201" }),
    ])
    assert.deepEqual(hit, { blocked: false })
  })

  it("tier-2 blocks on genuine window overlap when raw has start/end", () => {
    const hit = checkTimeEntryOverlap(
      {
        ...baseProposal,
        note: "Client workshop (Fireflies)",
        meetingStartIso: "2026-08-13T00:00:00.000Z",
        durationMinutes: 60,
      },
      [
        entry({
          note: "Unrelated admin",
          myhoursLogId: "300",
          durationMinutes: 60,
          raw: {
            startTime: "2026-08-13T00:30:00.000Z",
            endTime: "2026-08-13T01:30:00.000Z",
          },
        }),
      ]
    )
    assert.equal(hit.blocked, true)
    if (hit.blocked) {
      assert.match(hit.reason, /overlap/i)
    }
  })

  it("tier-2 skips when meeting has no usable start", () => {
    const hit = checkTimeEntryOverlap(
      {
        ...baseProposal,
        note: "Client workshop (Fireflies)",
        meetingStartIso: null,
        durationMinutes: 60,
      },
      [
        entry({
          note: "Unrelated admin",
          myhoursLogId: "301",
          raw: {
            startTime: "2026-08-13T00:00:00.000Z",
            endTime: "2026-08-13T01:00:00.000Z",
          },
        }),
      ]
    )
    assert.deepEqual(hit, { blocked: false })
  })

  it("tier-2 ignores entries without parseable raw times", () => {
    const hit = checkTimeEntryOverlap(
      {
        ...baseProposal,
        note: "Client workshop (Fireflies)",
        meetingStartIso: "2026-08-13T00:00:00.000Z",
        durationMinutes: 60,
      },
      [entry({ note: "Manual block", myhoursLogId: "302", raw: { note: "x" } })]
    )
    assert.deepEqual(hit, { blocked: false })
  })

  it("non-overlapping windows on same day are allowed", () => {
    const hit = checkTimeEntryOverlap(
      {
        ...baseProposal,
        note: "Morning standup (Fireflies)",
        meetingStartIso: "2026-08-13T00:00:00.000Z",
        durationMinutes: 30,
      },
      [
        entry({
          note: "Afternoon deep work",
          myhoursLogId: "303",
          raw: {
            startTime: "2026-08-13T06:00:00.000Z",
            endTime: "2026-08-13T07:00:00.000Z",
          },
        }),
      ]
    )
    assert.deepEqual(hit, { blocked: false })
  })
})
