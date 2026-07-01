import assert from "node:assert/strict"
import test from "node:test"

import {
  mergedSpanWidthPx,
  reorderExpertRows,
  weekColStyle,
} from "../expertGridInteractions.js"
import { WEEK_COL_WIDTH_PX } from "../expertGridShared.js"

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

test("weekColStyle returns default 112 when no override", () => {
  const style = weekColStyle("2025-W01")
  assert.equal(style.width, WEEK_COL_WIDTH_PX)
  assert.equal(style.minWidth, WEEK_COL_WIDTH_PX)
  assert.equal(style.maxWidth, WEEK_COL_WIDTH_PX)
  assert.equal(style.boxSizing, "border-box")
})

test("weekColStyle returns override when present", () => {
  const style = weekColStyle("2025-W01", { "2025-W01": 200 })
  assert.equal(style.width, 200)
  assert.equal(style.minWidth, 200)
  assert.equal(style.maxWidth, 200)
})

test("mergedSpanWidthPx sums per-week widths with mixed overrides", () => {
  const weekKeys = ["2025-W01", "2025-W02", "2025-W03", "2025-W04"]
  const widths = { "2025-W02": 150, "2025-W03": 80 }
  const total = mergedSpanWidthPx(weekKeys, "2025-W01", "2025-W03", widths)
  assert.equal(total, WEEK_COL_WIDTH_PX + 150 + 80)
})

test("mergedSpanWidthPx equals 112 × spanLen when no overrides", () => {
  const weekKeys = ["2025-W01", "2025-W02", "2025-W03", "2025-W04"]
  const total = mergedSpanWidthPx(weekKeys, "2025-W01", "2025-W03")
  assert.equal(total, WEEK_COL_WIDTH_PX * 3)
})
