import assert from "node:assert/strict"
import test from "node:test"

import {
  TASK_CATEGORIES,
  TASK_CATEGORY_OPTIONS,
  TASK_SOURCES,
  isTaskCategory,
  isTaskSource,
} from "../types.js"

test("TASK_CATEGORIES is the Stage-0 closed set", () => {
  assert.deepEqual([...TASK_CATEGORIES], [
    "reporting",
    "pacing",
    "creative",
    "finance",
    "admin",
    "meeting_followup",
    "other",
  ])
})

test("TASK_CATEGORY_OPTIONS covers every category exactly once", () => {
  const values = TASK_CATEGORY_OPTIONS.map((o) => o.value)
  assert.deepEqual(values, [...TASK_CATEGORIES])
  for (const opt of TASK_CATEGORY_OPTIONS) {
    assert.ok(opt.label.trim().length > 0, `${opt.value} needs a label`)
  }
})

test("isTaskCategory accepts only known values", () => {
  assert.equal(isTaskCategory("finance"), true)
  assert.equal(isTaskCategory("meeting_followup"), true)
  assert.equal(isTaskCategory("unknown"), false)
  assert.equal(isTaskCategory(null), false)
})

test("TASK_SOURCES and isTaskSource", () => {
  assert.deepEqual([...TASK_SOURCES], ["manual", "ava", "template", "recurring"])
  assert.equal(isTaskSource("manual"), true)
  assert.equal(isTaskSource("ava"), true)
  assert.equal(isTaskSource("xano"), false)
})
