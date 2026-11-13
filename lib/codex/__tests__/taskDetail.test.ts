/**
 * Codex task detail for project tasks (B40): pure rules for assigned by,
 * dates, type, subtasks and the S1 part of a PATCH.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  asapOffered,
  assignedByAfterAssign,
  assigneeChanged,
  checkSubtaskOrder,
  checkSubtaskParent,
  checkTaskDates,
  checkTaskTypeChange,
  hasTaskDetailKeys,
  parentLinkLabel,
  parseCreateSubtaskInput,
  parseTaskDetailPatch,
  SUBTASKS_PER_TASK_MAX,
  taskTypeBadge,
} from "../taskDetail.js"
import { taskPriorityChoices, taskPriorityLabel, validateTaskInput } from "../types.js"
import { compareTasksForSort, parseTaskPriorityFilter } from "../queryHelpers.js"

test("B40fix (F6): on the Tasks page ASAP sorts above High, reads ASAP, filters, and is offered only once 0118 answers", () => {
  const rows = [
    { id: 1, priority: "low", due_date: null },
    { id: 2, priority: "high", due_date: null },
    { id: 3, priority: "asap", due_date: null },
    { id: 4, priority: "normal", due_date: null },
    { id: 5, priority: null, due_date: null },
  ]
  assert.deepEqual([...rows].sort((a, b) => compareTasksForSort(a, b, "priority_desc")).map((r) => r.priority), ["asap", "high", "normal", "low", null])
  assert.deepEqual(parseTaskPriorityFilter("asap,high,bogus"), ["asap", "high"])
  assert.equal(taskPriorityLabel("asap"), "ASAP")
  assert.equal(taskPriorityLabel("high"), "High")
  assert.equal(taskPriorityLabel(null), "Normal")
  assert.deepEqual(taskPriorityChoices(false).map((p) => p.value), ["low", "normal", "high"])
  assert.deepEqual(taskPriorityChoices(true).map((p) => p.value), ["low", "normal", "high", "asap"])
  assert.equal(asapOffered(true, true, "normal"), true)
  assert.equal(asapOffered(true, false, "normal"), false, "before the panel's read answers (503 before 0118)")
  assert.equal(asapOffered(false, true, "high"), false, "switch off")
  assert.equal(asapOffered(false, false, "asap"), true, "a task already ASAP keeps its choice")
})

test("assigned by: someone else gets it, the saver is assigned by; self or nobody clears", () => {
  assert.equal(assignedByAfterAssign("Mia@AM.com.au", "luke@am.com.au"), "luke@am.com.au")
  assert.equal(assignedByAfterAssign("LUKE@am.com.au", "luke@am.com.au"), null)
  assert.equal(assignedByAfterAssign(null, "luke@am.com.au"), null)
  assert.equal(assignedByAfterAssign("mia@am.com.au", null), null)
  assert.equal(assigneeChanged("Mia@am.com.au", "mia@am.com.au "), false)
  assert.equal(assigneeChanged(null, ""), false)
  assert.equal(assigneeChanged("mia@am.com.au", null), true)
})

test("dates: start on or before due", () => {
  assert.deepEqual(checkTaskDates("2026-11-02", "2026-11-02"), { ok: true })
  assert.deepEqual(checkTaskDates(null, "2026-11-02"), { ok: true })
  assert.equal((checkTaskDates("2026-11-03", "2026-11-02") as { reason: string }).reason, "start_after_due")
})

test("type: task and milestone switch; a subtask, help or approval keeps its type", () => {
  assert.deepEqual(checkTaskTypeChange("task", "milestone"), { ok: true })
  assert.deepEqual(checkTaskTypeChange("milestone", "task"), { ok: true })
  assert.deepEqual(checkTaskTypeChange("subtask", "subtask" as never), { ok: true })
  assert.equal((checkTaskTypeChange("subtask", "task") as { reason: string }).reason, "task_type_fixed")
  // B40fix (F10): a help child never becomes a milestone; a plain task still can.
  assert.equal((checkTaskTypeChange("task", "milestone", { helpChild: true }) as { reason: string }).reason, "task_type_fixed")
  assert.deepEqual(checkTaskTypeChange("task", "task", { helpChild: true }), { ok: true })
  assert.deepEqual(checkTaskTypeChange("task", "milestone", { helpChild: false }), { ok: true })
  assert.equal(parentLinkLabel("subtask"), "Subtask of")
  assert.equal(parentLinkLabel("task"), "Help for:")
  assert.equal(parentLinkLabel(undefined), "Help for:")
  assert.equal((checkTaskTypeChange("help", "milestone") as { reason: string }).reason, "task_type_fixed")
  assert.equal(taskTypeBadge("milestone"), "Milestone")
  assert.equal(taskTypeBadge("task"), null)
})

test("PATCH detail keys: dates, type, values; due_on and due_date together refused", () => {
  assert.equal(hasTaskDetailKeys({ title: "x" }), false)
  assert.equal(hasTaskDetailKeys({ start_on: null }), true)
  const r = parseTaskDetailPatch({ start_on: "2026-11-02", due_on: "2026-11-05", task_type: "milestone", custom_values: { "7": "o1" } })
  assert.ok(r.ok)
  assert.deepEqual(r.value, { start_on: "2026-11-02", due_on: "2026-11-05", task_type: "milestone", custom_values: { "7": "o1" } })
  const cleared = parseTaskDetailPatch({ start_on: null, due_on: "" })
  assert.ok(cleared.ok)
  assert.deepEqual(cleared.value, { start_on: null, due_on: null })
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ due_on: "2026-11-05", due_date: "2026-11-05" }, "invalid_due_on"],
    [{ start_on: "2026-02-30" }, "invalid_start_on"],
    [{ due_on: "5/11/2026" }, "invalid_due_on"],
    [{ start_on: "2026-11-06", due_on: "2026-11-05" }, "start_after_due"],
    [{ task_type: "subtask" }, "invalid_task_type"],
    [{ task_type: "help" }, "invalid_task_type"],
    [{ custom_values: [] }, "invalid_custom_values"],
  ]
  for (const [body, error] of cases) {
    const p = parseTaskDetailPatch(body)
    assert.equal(!p.ok && p.error, error, JSON.stringify(body))
  }
})

test("new subtask: title required and capped, assignee an email, dates real and in order", () => {
  const r = parseCreateSubtaskInput({ title: "  Brief  creative ", assignee_email: " Mia@AM.com.au", due_on: "2026-11-20" })
  assert.ok(r.ok)
  assert.deepEqual(r.value, { title: "Brief creative", assignee_email: "mia@am.com.au", start_on: null, due_on: "2026-11-20" })
  for (const [body, error] of [
    [{}, "invalid_title"],
    [{ title: "x".repeat(301) }, "invalid_title"],
    [{ title: "x", assignee_email: "mia" }, "invalid_assignee_email"],
    [{ title: "x", due_on: "2026-13-01" }, "invalid_due_on"],
    [{ title: "x", start_on: "2026-11-21", due_on: "2026-11-20" }, "start_after_due"],
  ] as Array<[unknown, string]>) {
    const p = parseCreateSubtaskInput(body)
    assert.equal(!p.ok && p.error, error, JSON.stringify(body))
  }
})

test("subtask parent: one level, capped; order names every live subtask once", () => {
  assert.deepEqual(checkSubtaskParent({ task_type: "task", parent_task_id: null, subtask_count: 0 }), { ok: true })
  assert.deepEqual(checkSubtaskParent({ task_type: "milestone", parent_task_id: null, subtask_count: 3 }), { ok: true })
  assert.equal((checkSubtaskParent({ task_type: "subtask", parent_task_id: 4, subtask_count: 0 }) as { reason: string }).reason, "nested_subtask")
  assert.equal((checkSubtaskParent({ task_type: "task", parent_task_id: 4, subtask_count: 0 }) as { reason: string }).reason, "nested_subtask", "a help child cannot have subtasks")
  assert.equal(
    (checkSubtaskParent({ task_type: "task", parent_task_id: null, subtask_count: SUBTASKS_PER_TASK_MAX }) as { reason: string }).reason,
    "too_many_subtasks"
  )
  assert.equal(checkSubtaskOrder([1, 2, 3], [3, 1, 2]), true)
  assert.equal(checkSubtaskOrder([1, 2, 3], [3, 1]), false)
  assert.equal(checkSubtaskOrder([1, 2, 3], [3, 1, 1]), false)
  assert.equal(checkSubtaskOrder([1, 2, 3], [3, 1, 4]), false)
})

test("priority asap only when allowed (codex_projects on)", () => {
  assert.equal(validateTaskInput({ priority: "asap" })?.field, "priority")
  assert.equal(validateTaskInput({ priority: "asap" }, { allowAsap: true }), null)
  assert.equal(validateTaskInput({ priority: "urgent" }, { allowAsap: true })?.field, "priority")
})
