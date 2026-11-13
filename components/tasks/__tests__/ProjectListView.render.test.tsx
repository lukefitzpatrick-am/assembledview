/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexCustomField } from "@/lib/codex/customFields"
import { EMPTY_LIST_FILTERS, NO_SECTION_KEY, type ListRow, type ProjectListState } from "@/lib/codex/projectList"
import type { CodexSection } from "@/lib/codex/projects"

import { projectLayoutFromParams, projectListRows, projectPageQuery } from "../ProjectBoardClient"
import { nextListSort, ProjectListView, type ProjectListViewProps } from "../ProjectListView"

const SECTIONS: CodexSection[] = [
  { id: 20, project_id: 5, name: "Next month", sort_order: 2, collapsed_default: false, status_category: "todo" },
  { id: 10, project_id: 5, name: "Today", sort_order: 0, collapsed_default: false, status_category: "in_progress" },
]

const FIELDS: CodexCustomField[] = [
  { id: 7, project_id: 5, name: "Progress", field_type: "single_select", options: [{ id: "o1", label: "In progress" }, { id: "o2", label: "Done" }], done_option: "o2" },
]

const ROWS: Record<string, ListRow[]> = {
  "10": [
    { id: 1, title: "Update Meta audiences", client_id: 0, status: "in_progress", assignee_email: "josh@x.au", assignee_name: "Josh Patel", assigned_by_email: "luke@x.au", due_on: "2026-11-10", priority: "high", custom_values: { "7": "o1" }, subtask_count: 2, sort_order: 0 },
    { id: 2, title: "Pull search query report", client_id: 0, status: "in_progress", assignee_email: "mia@x.au", assignee_name: "Mia Tran", due_on: "2026-11-30", priority: "asap", sort_order: 1 },
  ],
  "20": [{ id: 4, title: "Creative swap live", client_id: 0, status: "todo", task_type: "milestone", sort_order: 0 }],
}

const noop = () => {}

function props(state: ProjectListState = { filters: EMPTY_LIST_FILTERS, sort: null }, overrides: Partial<ProjectListViewProps> = {}): ProjectListViewProps {
  return {
    sections: SECTIONS,
    fields: FIELDS,
    rowsBySection: ROWS,
    totals: { "10": 60, "20": 1 },
    state,
    onStateChange: noop,
    onOpenTask: noop,
    onLoadMore: noop,
    meEmail: "luke@x.au",
    today: "2026-11-13",
    ...overrides,
  }
}

describe("project list view (B40)", () => {
  it("groups by section in board order with the columns, field values, markers and Load more", () => {
    const html = renderToStaticMarkup(<ProjectListView {...props()} />)
    const today = html.indexOf('data-section="10"')
    const next = html.indexOf('data-section="20"')
    expect(today).toBeGreaterThan(0)
    expect(next).toBeGreaterThan(today)
    expect(html).toContain("Today · In progress")
    for (const header of ["Task", "Assignee", "Assigned by", "Due", "Priority", "Progress"]) expect(html).toContain(`>${header}<`)
    expect(html).toContain("Josh Patel")
    expect(html).toContain(">You<")
    expect(html).toContain(">In progress<")
    expect(html).toContain("ASAP")
    expect(html).toContain(">Milestone<")
    expect(html).toContain("Load more (58 left)")
    // The overdue due date uses the critical colour.
    expect(html).toMatch(/font-semibold[^"]*"[^>]*>[^<]*10 Nov/)
  })

  it("filters and sorts from the state: assignee, then due descending", () => {
    const html = renderToStaticMarkup(
      <ProjectListView {...props({ filters: { ...EMPTY_LIST_FILTERS, priorities: ["asap", "high"] }, sort: { column: "due", desc: true } })} />
    )
    expect(html.indexOf("Pull search query report")).toBeLessThan(html.indexOf("Update Meta audiences"))
    expect(html).not.toContain("Creative swap live")
    expect(html).toContain("Clear filters")
    expect(html).toContain('aria-sort="descending"')
  })

  it("B40fix (F8): project tasks without a section show last in a No section group (no Load more there)", () => {
    const loose: ListRow = { id: 9, title: "Orphan brief", client_id: 0, status: "todo", sort_order: null }
    const html = renderToStaticMarkup(
      <ProjectListView {...props(undefined, { rowsBySection: { ...ROWS, [NO_SECTION_KEY]: [loose] }, totals: { "10": 60, "20": 1, [NO_SECTION_KEY]: 3 } })} />
    )
    const group = html.indexOf(`data-section="${NO_SECTION_KEY}"`)
    expect(group).toBeGreaterThan(html.indexOf('data-section="20"'))
    expect(html).toContain(">No section<")
    expect(html.indexOf("Orphan brief")).toBeGreaterThan(group)
    expect(html).toContain("2 more without a section")
    expect(html.match(/Load more/g)?.length).toBe(1)
    const none = renderToStaticMarkup(<ProjectListView {...props()} />)
    expect(none).not.toContain("No section")
  })

  it("B40fix (F8): the page passes the board's unsectioned tasks to the list", () => {
    const board = { columns: { "section:10": ROWS["10"] as never, "section:20": [] }, counts: { "section:10": 60, "section:20": 0 } }
    const { rows, totals } = projectListRows(SECTIONS, board, { items: [{ id: 9, title: "Orphan", client_id: 0, status: "todo" }], total: 1 })
    expect(rows[NO_SECTION_KEY]?.map((r) => r.id)).toEqual([9])
    expect(totals[NO_SECTION_KEY]).toBe(1)
    expect(rows["10"]).toHaveLength(2)
    expect(projectListRows(SECTIONS, board, { items: [], total: 0 }).rows[NO_SECTION_KEY]).toBeUndefined()
  })

  it("header clicks cycle ascending, descending, board order", () => {
    expect(nextListSort(null, "due")).toEqual({ column: "due", desc: false })
    expect(nextListSort({ column: "due", desc: false }, "due")).toEqual({ column: "due", desc: true })
    expect(nextListSort({ column: "due", desc: true }, "due")).toBeNull()
    expect(nextListSort({ column: "due", desc: true }, "title")).toEqual({ column: "title", desc: false })
  })

  it("the page query: view=list or a saved view id, list keys, completed kept; a saved view's layout wins", () => {
    const state: ProjectListState = { filters: { ...EMPTY_LIST_FILTERS, q: "meta" }, sort: { column: "due", desc: false } }
    expect(projectPageQuery(new URLSearchParams("completed=show&view=board&junk=1"), "list", state)).toBe("completed=show&view=list&q=meta&sort=due")
    expect(projectPageQuery(new URLSearchParams(""), "board", state)).toBe("q=meta&sort=due")
    expect(projectPageQuery(new URLSearchParams(""), "list", state, 12)).toBe("view=12&q=meta&sort=due")
    expect(projectLayoutFromParams("list", null)).toBe("list")
    expect(projectLayoutFromParams("board", null)).toBe("board")
    expect(projectLayoutFromParams(null, null)).toBe("board")
    expect(projectLayoutFromParams("12", { layout: "list" })).toBe("list")
    expect(projectLayoutFromParams("12", { layout: null })).toBe("board")
  })
})
