/**
 * Codex project list view (B40): pure grouping, sort, filter and the query
 * string it shares with links and saved views.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { CodexCustomField } from "../customFields.js"
import type { CodexSection } from "../projects.js"
import {
  fieldCellText,
  filterListRows,
  groupListRows,
  isListFiltered,
  parseProjectListParams,
  projectListFiltersRecord,
  serializeProjectListParams,
  sortListRows,
  EMPTY_LIST_FILTERS,
  NO_SECTION_KEY,
  type ListRow,
} from "../projectList.js"

const progress: CodexCustomField = {
  id: 7,
  project_id: 1,
  name: "Progress",
  field_type: "single_select",
  options: [
    { id: "o3", label: "Not started" },
    { id: "o1", label: "In progress" },
    { id: "o2", label: "Done" },
  ],
  done_option: "o2",
}

function row(id: number, extra: Partial<ListRow>): ListRow {
  return { id, title: `T${id}`, client_id: 0, status: "todo", sort_order: id, ...extra }
}

const rows: ListRow[] = [
  row(1, { title: "Update Meta audiences", assignee_email: "josh@am.com.au", assignee_name: "Josh Patel", due_on: "2026-11-13", priority: "high", custom_values: { "7": "o1" } }),
  row(2, { title: "Pull search query report", assignee_email: "mia@am.com.au", assignee_name: "Mia Tran", due_on: "2026-11-30", priority: "normal", custom_values: { "7": "o3" } }),
  row(3, { title: "Pixel check", due_on: "2026-11-05", priority: "asap" }),
  row(4, { title: "December scope", assignee_email: "mia@am.com.au", assignee_name: "Mia Tran", priority: "low", custom_values: { "7": "o2" } }),
]

const TODAY = "2026-11-13"

test("query string round trip, unknown values dropped, fixed order", () => {
  const params = new URLSearchParams("view=list&q= meta &assignee=Mia@AM.com.au&priority=high,bogus,high,asap&due=week&field_7=o1&field_x=o1&field_8=bad&sort=-field:7")
  const state = parseProjectListParams(params)
  assert.deepEqual(state.filters, { q: "meta", assignee: "mia@am.com.au", priorities: ["high", "asap"], due: "week", fields: { "7": "o1" } })
  assert.deepEqual(state.sort, { column: "field:7", desc: true })
  assert.deepEqual(serializeProjectListParams(state), [
    ["q", "meta"],
    ["assignee", "mia@am.com.au"],
    ["priority", "high,asap"],
    ["due", "week"],
    ["field_7", "o1"],
    ["sort", "-field:7"],
  ])
  assert.deepEqual(projectListFiltersRecord(state).sort, "-field:7")
  assert.equal(parseProjectListParams(new URLSearchParams("sort=bogus")).sort, null)
  assert.equal(isListFiltered(EMPTY_LIST_FILTERS), false)
  assert.equal(isListFiltered(state.filters), true)
})

test("filters: title text, assignee or none, priorities, due buckets, field option or none", () => {
  const ids = (f: Partial<typeof EMPTY_LIST_FILTERS>) => filterListRows(rows, { ...EMPTY_LIST_FILTERS, ...f }, TODAY).map((r) => r.id)
  assert.deepEqual(ids({ q: "META" }), [1])
  assert.deepEqual(ids({ assignee: "mia@am.com.au" }), [2, 4])
  assert.deepEqual(ids({ assignee: "none" }), [3])
  assert.deepEqual(ids({ priorities: ["asap", "high"] }), [1, 3])
  assert.deepEqual(ids({ due: "overdue" }), [3])
  assert.deepEqual(ids({ due: "week" }), [1], "today to today plus 7")
  assert.deepEqual(ids({ due: "none" }), [4])
  assert.deepEqual(ids({ fields: { "7": "o3" } }), [2])
  assert.deepEqual(ids({ fields: { "7": "none" } }), [3])
  const done = filterListRows([row(9, { due_on: "2026-11-01", status: "done" })], { ...EMPTY_LIST_FILTERS, due: "overdue" }, TODAY)
  assert.deepEqual(done, [], "a done task is never overdue")
})

test("sort: each column both ways, empty values last both ways, ties and no sort keep board order", () => {
  const ids = (column: string, desc = false) =>
    sortListRows(rows, { column: column as never, desc }, [progress]).map((r) => r.id)
  assert.deepEqual(ids("due"), [3, 1, 2, 4])
  assert.deepEqual(ids("due", true), [2, 1, 3, 4])
  assert.deepEqual(ids("priority"), [3, 1, 2, 4])
  assert.deepEqual(ids("assignee"), [1, 2, 4, 3])
  assert.deepEqual(ids("assignee", true), [2, 4, 1, 3])
  assert.deepEqual(ids("title"), [4, 3, 2, 1])
  // Option order (Not started, In progress, Done), not the label's alphabet.
  assert.deepEqual(ids("field:7"), [2, 1, 4, 3])
  assert.deepEqual(sortListRows([...rows].reverse(), null).map((r) => r.id), [1, 2, 3, 4])
})

test("groups: sections in board order with filtered, sorted rows and the server totals", () => {
  const sections: CodexSection[] = [
    { id: 20, project_id: 1, name: "Next month", sort_order: 2, collapsed_default: false, status_category: "todo" },
    { id: 10, project_id: 1, name: "Today", sort_order: 0, collapsed_default: false, status_category: "in_progress" },
  ]
  const groups = groupListRows(
    sections,
    { "10": [rows[0], rows[1]], "20": [rows[3]] },
    { filters: { ...EMPTY_LIST_FILTERS, assignee: "mia@am.com.au" }, sort: null },
    [progress],
    { "10": 60 },
    TODAY
  )
  assert.deepEqual(groups.map((g) => g.section?.name), ["Today", "Next month"])
  assert.deepEqual(groups.map((g) => g.rows.map((r) => r.id)), [[2], [4]])
  assert.deepEqual(groups.map((g) => g.total), [60, 1])
  assert.equal(fieldCellText(progress, rows[0]), "In progress")
  assert.equal(fieldCellText(progress, rows[2]), "")

  // B40fix (F8): project tasks without a section show last in a "No section" group, filtered and sorted the same.
  const loose = groupListRows(
    sections,
    { "10": [rows[0]], [NO_SECTION_KEY]: [rows[2], rows[1]] },
    { filters: EMPTY_LIST_FILTERS, sort: { column: "title", desc: false } },
    [progress],
    { [NO_SECTION_KEY]: 2 },
    TODAY
  )
  assert.deepEqual(loose.map((g) => g.section?.name ?? null), ["Today", "Next month", null])
  assert.deepEqual(loose[2].rows.map((r) => r.id), [3, 2], "sorted by title as the sections are")
  assert.equal(loose[2].total, 2)
  const filtered = groupListRows(sections, { [NO_SECTION_KEY]: [rows[2]] }, { filters: { ...EMPTY_LIST_FILTERS, assignee: "nobody@x.au" }, sort: null }, [], {}, TODAY)
  assert.equal(filtered.length, 3, "the group stays (with no matches) while it has tasks")
  assert.deepEqual(filtered[2].rows, [])
  assert.equal(groupListRows(sections, {}, { filters: EMPTY_LIST_FILTERS, sort: null }, [], {}, TODAY).length, 2, "no tasks without a section: no group")
})
