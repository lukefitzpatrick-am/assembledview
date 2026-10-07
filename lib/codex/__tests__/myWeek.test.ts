import assert from "node:assert/strict"
import { test } from "node:test"

import { myWeekDueBefore } from "../quickAddParse.js"
import {
  applyTasksFilterChange,
  buildTasksFetchParams,
  parseTasksFilterParams,
  type TasksFilterState,
} from "../queryHelpers.js"

/** 12:00 on 14 Aug 2026 in Sydney (AEST, UTC+10). */
const NOW = new Date("2026-08-14T02:00:00.000Z")

const weekOn: TasksFilterState = {
  clientId: "",
  mbaNumber: "",
  search: "",
  assigneeEmail: "luke@assembledmedia.com.au",
  category: "",
  statuses: ["backlog", "todo", "in_progress", "waiting"],
  mine: false,
  myWeek: true,
}

function fetchFor(
  state: TasksFilterState,
  now: Date = NOW
): URLSearchParams {
  return buildTasksFetchParams({
    page: 1,
    perPage: 100,
    sort: "due_date_asc",
    clientId: state.clientId,
    mbaNumber: state.mbaNumber,
    category: state.category,
    q: state.search,
    assigneeEmail: state.assigneeEmail,
    statuses: state.statuses,
    mine: state.mine,
    myWeek: state.myWeek,
    now,
  })
}

test("myWeekDueBefore is Sydney today plus seven days", () => {
  assert.equal(myWeekDueBefore(NOW), "2026-08-21")
  assert.equal(myWeekDueBefore(new Date("2026-08-14T16:00:00.000Z")), "2026-08-22")
})

test("My week fetch has no due_after and includes overdue up to today+7", () => {
  const params = fetchFor(weekOn)
  assert.equal(params.get("due_before"), "2026-08-21")
  assert.equal(params.get("due_after"), null)
  assert.equal(params.get("mine"), "1")
  assert.equal(params.get("status"), "backlog,todo,in_progress,waiting")
  assert.equal(params.get("assignee_email"), null)
})

test("changing client exits My week to mine=1 plus that client", () => {
  const next = applyTasksFilterChange(weekOn, { clientId: "12" })
  assert.equal(next.myWeek, false)
  assert.equal(next.mine, true)
  assert.equal(next.clientId, "12")
  assert.deepEqual(next.statuses, [])
  assert.equal(next.assigneeEmail, "")

  const params = fetchFor(next)
  assert.equal(params.get("mine"), "1")
  assert.equal(params.get("client_id"), "12")
  assert.equal(params.get("due_before"), null)
  assert.equal(params.get("due_after"), null)
  assert.equal(params.get("status"), null)
  assert.equal(params.get("assignee_email"), null)
})

test("reload with week=1 fetches the same params as turning My week on", () => {
  const live = fetchFor({ ...weekOn, assigneeEmail: "", statuses: [], mine: true })
  const parsed = parseTasksFilterParams(new URLSearchParams("week=1"))
  const reloaded = fetchFor({
    clientId: parsed.clientId ?? "",
    mbaNumber: parsed.mbaNumber ?? "",
    search: parsed.search ?? "",
    assigneeEmail: parsed.assigneeEmail ?? "",
    category: parsed.category ?? "",
    statuses: parsed.statuses ?? [],
    mine: parsed.mine,
    myWeek: parsed.myWeek,
  })
  assert.equal(reloaded.toString(), live.toString())
  assert.equal(parsed.myWeek, true)
})
