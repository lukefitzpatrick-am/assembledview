import assert from "node:assert/strict"
import { test } from "node:test"

import {
  applyTasksFilterChange,
  buildTasksFetchParams,
  parseMbaNumbersQuery,
  parseTasksDeepLinkParams,
  parseTasksFilterParams,
  serializeTasksFilterParams,
  taskDetailHref,
  taskListHref,
  type TasksFilterState,
} from "../queryHelpers.js"

test("parseTasksDeepLinkParams round-trips mba + client", () => {
  const params = new URLSearchParams()
  params.set("mba", "KRUSTY001")
  params.set("client", "12")
  assert.deepEqual(parseTasksDeepLinkParams(params), {
    mbaNumber: "KRUSTY001",
    clientId: "12",
  })
})

test("parseTasksFilterParams preserves mba and hydrates compact toolbar state", () => {
  const params = new URLSearchParams(
    "mba=KRUSTY001&client=12&q=pacing&assignee=luke%40assembledmedia.com.au&category=reporting&status=todo,waiting&all=1&view=board"
  )
  const parsed = parseTasksFilterParams(params)
  assert.equal(parsed.mbaNumber, "KRUSTY001")
  assert.equal(parsed.clientId, "12")
  assert.equal(parsed.search, "pacing")
  assert.equal(parsed.assigneeEmail, "luke@assembledmedia.com.au")
  assert.equal(parsed.category, "reporting")
  assert.deepEqual(parsed.statuses, ["todo", "waiting"])
  assert.equal(parsed.mine, false)
  assert.equal(parsed.myWeek, false)
  assert.equal(parsed.view, "board")
})

test("serializeTasksFilterParams round-trips and keeps ?mba=", () => {
  const qs = serializeTasksFilterParams({
    mbaNumber: "KRUSTY001",
    clientId: "12",
    search: "pacing",
    assigneeEmail: "luke@assembledmedia.com.au",
    category: "reporting",
    statuses: ["todo", "waiting"],
    mine: false,
    myWeek: false,
    view: "board",
  })
  const parsed = parseTasksFilterParams(new URLSearchParams(qs))
  assert.equal(parsed.mbaNumber, "KRUSTY001")
  assert.equal(parsed.view, "board")
  assert.equal(parsed.mine, false)
  assert.match(qs, /mba=KRUSTY001/)
  assert.doesNotMatch(qs, /view=/)
})

test("tasks view defaults to board when no view param is present", () => {
  const parsed = parseTasksFilterParams(new URLSearchParams())
  assert.equal(parsed.view, "board")
})

test("stored list wins over the board default when the URL has no view", () => {
  const parsed = parseTasksFilterParams(new URLSearchParams(), {
    storedView: "list",
  })
  assert.equal(parsed.view, "list")
})

test("explicit URL view wins over the stored layout", () => {
  const listUrl = parseTasksFilterParams(new URLSearchParams("view=list"), {
    storedView: "board",
  })
  assert.equal(listUrl.view, "list")
  const boardUrl = parseTasksFilterParams(new URLSearchParams("view=board"), {
    storedView: "list",
  })
  assert.equal(boardUrl.view, "board")
})

test("serializeTasksFilterParams writes view=list and omits the board default", () => {
  const listQs = serializeTasksFilterParams({ view: "list" })
  assert.equal(listQs, "view=list")
  const boardQs = serializeTasksFilterParams({ view: "board" })
  assert.equal(boardQs, "")
})

test("parseMbaNumbersQuery preserves order and uniqueness", () => {
  assert.deepEqual(parseMbaNumbersQuery("Z,A,Z,B"), ["Z", "A", "B"])
})

test("taskDetailHref keeps filters and drops task", () => {
  assert.equal(
    taskDetailHref(42, new URLSearchParams("q=pacing&mba=KRUSTY001&task=7&view=list")),
    "/tasks/42?q=pacing&mba=KRUSTY001&view=list"
  )
  assert.equal(taskDetailHref(3, new URLSearchParams("task=3")), "/tasks/3")
})

test("taskListHref keeps filters, drops task, and is /tasks when empty", () => {
  assert.equal(
    taskListHref(new URLSearchParams("q=pacing&task=7")),
    "/tasks?q=pacing"
  )
  assert.equal(taskListHref(new URLSearchParams()), "/tasks")
  assert.equal(taskListHref(new URLSearchParams("task=9")), "/tasks")
})

const filterBase: TasksFilterState = {
  clientId: "",
  mbaNumber: "",
  search: "",
  assigneeEmail: "luke@assembledmedia.com.au",
  category: "",
  statuses: ["todo"],
  mine: true,
  myWeek: true,
}

test("unassigned turns mine off and clears the assignee", () => {
  const parsed = parseTasksFilterParams(
    new URLSearchParams("unassigned=1&assignee=luke%40assembledmedia.com.au")
  )
  assert.equal(parsed.unassigned, true)
  assert.equal(parsed.mine, false)
  assert.equal(parsed.assigneeEmail, null)

  const next = applyTasksFilterChange(filterBase, {
    unassigned: true,
    mine: false,
    assigneeEmail: "",
  })
  assert.equal(next.myWeek, false)
  assert.equal(next.mine, false)
  assert.equal(next.unassigned, true)
  assert.equal(next.assigneeEmail, "")

  const qs = serializeTasksFilterParams(next)
  assert.match(qs, /unassigned=1/)
  assert.match(qs, /all=1/)
  assert.doesNotMatch(qs, /assignee=/)
  assert.doesNotMatch(qs, /week=/)
})

test("no_client excludes a selected client", () => {
  const parsed = parseTasksFilterParams(
    new URLSearchParams("client=12&no_client=1")
  )
  assert.equal(parsed.noClient, true)
  assert.equal(parsed.clientId, null)

  const qs = serializeTasksFilterParams({ clientId: "12", noClient: true, mine: true })
  assert.match(qs, /no_client=1/)
  assert.equal(new URLSearchParams(qs).get("client"), null)

  const params = buildTasksFetchParams({
    page: 1,
    perPage: 10,
    sort: "due_asc",
    mine: true,
    myWeek: false,
    noClient: true,
    clientId: "12",
  })
  assert.equal(params.get("no_client"), "1")
  assert.equal(params.get("client_id"), null)
})

test("category=none is the uncategorised filter", () => {
  const parsed = parseTasksFilterParams(new URLSearchParams("category=None"))
  assert.equal(parsed.category, "none")
  const qs = serializeTasksFilterParams({ category: "none", mine: true })
  assert.match(qs, /category=none/)
  const params = buildTasksFetchParams({
    page: 1,
    perPage: 10,
    sort: "due_asc",
    mine: true,
    myWeek: false,
    category: "none",
  })
  assert.equal(params.get("category"), "none")
})

test("due_from and due_to map onto due_after and due_before", () => {
  const parsed = parseTasksFilterParams(
    new URLSearchParams("due_from=2026-08-01&due_to=2026-08-14")
  )
  assert.equal(parsed.dueFrom, "2026-08-01")
  assert.equal(parsed.dueTo, "2026-08-14")
  assert.equal(
    parseTasksFilterParams(new URLSearchParams("due_from=nope")).dueFrom,
    null
  )

  const params = buildTasksFetchParams({
    page: 1,
    perPage: 10,
    sort: "due_asc",
    mine: true,
    myWeek: false,
    dueFrom: "2026-08-01",
    dueTo: "2026-08-14",
  })
  assert.equal(params.get("due_after"), "2026-08-01")
  assert.equal(params.get("due_before"), "2026-08-14")
  assert.equal(params.get("due_from"), null)
  assert.equal(params.get("due_to"), null)
})
