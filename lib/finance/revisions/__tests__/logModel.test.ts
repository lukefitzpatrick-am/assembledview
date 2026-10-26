import assert from "node:assert/strict"
import test from "node:test"

import { summariseRevisionLog, sydneyDateTime, type RevisionLogRowDto } from "../logModel"

const row = (over: Partial<RevisionLogRowDto>): RevisionLogRowDto => ({
  id: 1,
  createdAt: "2026-10-26T06:00:00Z",
  mbaNumber: "PENFOLD020",
  mode: "bill_amount",
  reason: "Client asked",
  source: "ui",
  status: "applied",
  createdByName: "Luke",
  baseVersionNumber: 29,
  newVersionNumber: 30,
  movedCents: 10_000_000,
  restoresRevisionId: null,
  diff: {
    months: [
      { month: "2026-10", total: { before: 1_416_067, after: 11_416_067 } },
      { month: "2026-11", total: { before: 10_015_093, after: 15_093 } },
    ],
    lines: [{ lineItemId: "PENFOLD020DV1", label: "DV1", media: [{ month: "2026-10", before: 363_636, after: 1_272_727 }] }],
    credits: [],
  },
  ...over,
})

test("log rows: Sydney time, versions, moved, months, only the newest applied can undo", () => {
  const items = summariseRevisionLog([
    row({ id: 3, status: "noted", newVersionNumber: null, movedCents: 0, diff: { credits: [{ lineItemId: "X1", month: "2026-09", cents: 54_839 }] } }),
    row({ id: 2, source: "ava" }),
    row({ id: 1, status: "restored" }),
  ])
  assert.equal(items[0]!.versions, "v29 (note only)")
  assert.equal(items[0]!.canUndo, false)
  assert.deepEqual(items[0]!.credits, ["X1 Sep 2026: credit $548.39"])
  assert.equal(items[1]!.canUndo, true)
  assert.equal(items[1]!.source, "Ava")
  assert.equal(items[1]!.versions, "v29 → v30")
  assert.equal(items[1]!.moved, "$100,000.00")
  assert.deepEqual(items[1]!.monthsChanged, ["Oct 2026", "Nov 2026"])
  assert.equal(items[2]!.status, "Undone")
  assert.equal(items[2]!.canUndo, false)
  assert.match(sydneyDateTime("2026-10-26T06:00:00Z"), /26 Oct 2026/)
  assert.match(sydneyDateTime("2026-10-31T13:30:00Z"), /1 Nov 2026/)
})
