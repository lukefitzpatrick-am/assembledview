import assert from "node:assert/strict"
import test from "node:test"

import { deleteExpertRow, duplicateExpertRow } from "../expertRowLifecycle.js"

type TestRow = {
  id: string
  weeklyValues: Record<string, number | "">
  mergedWeekSpans?: Array<{ id: string; label: string; weekCount: number }>
  name: string
  sourceLineItemId?: string
}

test("duplicateExpertRow returns null for a missing row index", () => {
  const rows: TestRow[] = [
    {
      id: "row-1",
      weeklyValues: { "2026-01-05": 10 },
      name: "One",
    },
  ]

  const next = duplicateExpertRow(
    rows,
    1,
    () => "row-copy",
    (i) => `span-copy-${i}`
  )

  assert.equal(next, null)
})

test("duplicateExpertRow inserts a copied row immediately after the source", () => {
  let rowId = 0
  const makeRowId = () => `row-copy-${++rowId}`
  const makeSpanId = (i: number) => `span-copy-${i}`
  const rows: TestRow[] = [
    {
      id: "row-1",
      weeklyValues: { "2026-01-05": 10 },
      name: "One",
    },
    {
      id: "row-2",
      weeklyValues: { "2026-01-05": 25, "2026-01-12": "" },
      mergedWeekSpans: [
        { id: "span-1", label: "First span", weekCount: 2 },
        { id: "span-2", label: "Second span", weekCount: 1 },
      ],
      name: "Two",
      sourceLineItemId: "source-2",
    },
    {
      id: "row-3",
      weeklyValues: { "2026-01-05": 30 },
      name: "Three",
    },
  ]

  const next = duplicateExpertRow(rows, 1, makeRowId, makeSpanId)

  assert.ok(next)
  assert.deepEqual(
    next.map((row) => row.id),
    ["row-1", "row-2", "row-copy-1", "row-3"]
  )
  assert.notEqual(next[2], rows[1])
  assert.equal(next[2].sourceLineItemId, undefined)
  assert.equal(next[2].name, "Two")
  assert.notEqual(next[2].weeklyValues, rows[1].weeklyValues)
  assert.deepEqual(next[2].weeklyValues, rows[1].weeklyValues)
  assert.deepEqual(next[2].mergedWeekSpans, [
    { id: "span-copy-0", label: "First span", weekCount: 2 },
    { id: "span-copy-1", label: "Second span", weekCount: 1 },
  ])
})

test("duplicateExpertRow creates an empty mergedWeekSpans array when the source has none", () => {
  const rows: TestRow[] = [
    {
      id: "row-1",
      weeklyValues: { "2026-01-05": 10 },
      name: "One",
      sourceLineItemId: "source-1",
    },
  ]

  const next = duplicateExpertRow(
    rows,
    0,
    () => "row-copy",
    (i) => `span-copy-${i}`
  )

  assert.ok(next)
  assert.deepEqual(next[1].mergedWeekSpans, [])
  assert.equal(next[1].sourceLineItemId, undefined)
})

test("deleteExpertRow returns null when one row or fewer would remain", () => {
  assert.equal(deleteExpertRow<TestRow>([], 0), null)
  assert.equal(
    deleteExpertRow(
      [
        {
          id: "row-1",
          weeklyValues: { "2026-01-05": 10 },
          name: "One",
        },
      ],
      0
    ),
    null
  )
})

test("deleteExpertRow removes only the requested row and preserves order", () => {
  const rows: TestRow[] = [
    {
      id: "row-1",
      weeklyValues: { "2026-01-05": 10 },
      name: "One",
    },
    {
      id: "row-2",
      weeklyValues: { "2026-01-05": 20 },
      name: "Two",
    },
    {
      id: "row-3",
      weeklyValues: { "2026-01-05": 30 },
      name: "Three",
    },
  ]

  const next = deleteExpertRow(rows, 1)

  assert.deepEqual(next, [rows[0], rows[2]])
})
