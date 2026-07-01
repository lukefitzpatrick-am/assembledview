import assert from "node:assert/strict"
import test from "node:test"

import { reorderExpertRows } from "../expertGridInteractions.js"

test("reorderExpertRows moves a row down", () => {
  const rows = ["a", "b", "c", "d"]
  const next = reorderExpertRows(rows, 0, 2)
  assert.deepEqual(next, ["b", "c", "a", "d"])
})

test("reorderExpertRows moves a row up", () => {
  const rows = ["a", "b", "c", "d"]
  const next = reorderExpertRows(rows, 3, 1)
  assert.deepEqual(next, ["a", "d", "b", "c"])
})

test("reorderExpertRows returns null when from equals to (no-op)", () => {
  const rows = ["a", "b", "c"]
  assert.equal(reorderExpertRows(rows, 1, 1), null)
})

test("reorderExpertRows returns null when indices are out of range", () => {
  const rows = ["a", "b", "c"]
  assert.equal(reorderExpertRows(rows, -1, 0), null)
  assert.equal(reorderExpertRows(rows, 0, -1), null)
  assert.equal(reorderExpertRows(rows, 3, 0), null)
  assert.equal(reorderExpertRows(rows, 0, 3), null)
})

test("reorderExpertRows preserves other elements and does not mutate input", () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const next = reorderExpertRows(rows, 0, 2)
  assert.notEqual(next, rows)
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.deepEqual(next, [{ id: 2 }, { id: 3 }, { id: 1 }])
})
