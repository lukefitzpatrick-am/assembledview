import assert from "node:assert/strict"
import test from "node:test"

import { formatActivityDiff } from "../activityDiff.js"

test("formatActivityDiff renders status change legibly", () => {
  const lines = formatActivityDiff({
    action: "update",
    before: { status: "todo", title: "X" },
    after: { status: "in_progress", title: "X" },
  })
  assert.deepEqual(lines, ["status: todo → in_progress"])
})

test("formatActivityDiff skips unchanged identity fields", () => {
  const lines = formatActivityDiff({
    action: "update",
    before: {
      id: 1,
      status: "todo",
      updated_at: "a",
      created_at: "b",
    },
    after: {
      id: 1,
      status: "done",
      updated_at: "c",
      created_at: "b",
    },
  })
  assert.deepEqual(lines, ["status: todo → done"])
})

test("formatActivityDiff create uses title", () => {
  const lines = formatActivityDiff({
    action: "create",
    after: { title: "Ship it" },
  })
  assert.deepEqual(lines, ['created “Ship it”'])
})

test("formatActivityDiff soft_delete", () => {
  assert.deepEqual(
    formatActivityDiff({ action: "soft_delete", before: {}, after: {} }),
    ["soft-deleted"]
  )
})
