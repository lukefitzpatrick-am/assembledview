import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseMbaNumbersQuery,
  parseTasksDeepLinkParams,
  parseTasksFilterParams,
  serializeTasksFilterParams,
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
