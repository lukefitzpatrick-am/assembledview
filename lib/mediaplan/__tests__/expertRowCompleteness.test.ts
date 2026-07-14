import assert from "node:assert/strict"
import { test } from "node:test"
import {
  countIncompleteExpertRows,
  expertRowIncompleteReasons,
  isExpertRowIncomplete,
} from "@/lib/mediaplan/expertRowCompleteness"

test("complete row with buyType, publisher, and qty is not incomplete", () => {
  const row = {
    buyType: "CPM",
    publisher: "Nine",
    weeklyValues: { "2026-01-04": 100 },
  }
  assert.equal(isExpertRowIncomplete(row), false)
  assert.deepEqual(expertRowIncompleteReasons(row), [])
})

test("empty required selects and $0 schedule flag as incomplete", () => {
  const row = {
    buyType: "",
    publisher: "",
    weeklyValues: { "2026-01-04": "" as const, "2026-01-11": 0 },
  }
  const reasons = expertRowIncompleteReasons(row)
  assert.ok(reasons.includes("Buy type"))
  assert.ok(reasons.includes("Publisher"))
  assert.ok(reasons.includes("Schedule quantity ($0 / empty)"))
  assert.equal(countIncompleteExpertRows([row, { buyType: "CPA", publisher: "X", weeklyValues: { a: 1 } }]), 1)
})

test("merged span qty counts as schedule quantity", () => {
  const row = {
    buyType: "CPM",
    publisher: "Seven",
    weeklyValues: {},
    mergedWeekSpans: [{ totalQty: 50 }],
  }
  assert.equal(isExpertRowIncomplete(row), false)
})
