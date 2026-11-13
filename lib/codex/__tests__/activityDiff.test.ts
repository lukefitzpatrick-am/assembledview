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

test("formatActivityDiff keeps asked-for-help action copy", () => {
  assert.deepEqual(
    formatActivityDiff({ action: "asked Ada for help" }),
    ["asked Ada for help"]
  )
  assert.deepEqual(
    formatActivityDiff({ action: "help from Bea done" }),
    ["help from Bea done"]
  )
})

test("B40: project task changes read as words; ids and order are not shown", () => {
  assert.deepEqual(
    formatActivityDiff({
      action: "move_section",
      before: { project_id: 5, section: "Inbound", section_id: 10 },
      after: { project_id: 5, section: "Done", section_id: 30 },
    }),
    ["section: Inbound → Done"]
  )
  assert.deepEqual(
    formatActivityDiff({ action: "update", before: { start_on: null, task_type: "task" }, after: { start_on: "2026-11-16", task_type: "milestone" } }),
    ["start date: — → 2026-11-16", "type: task → milestone"]
  )
})
