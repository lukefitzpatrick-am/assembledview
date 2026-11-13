/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { TeamMember } from "@/lib/codex/types"

import { TaskProjectPanel, TaskProjectPanelView, type TaskProjectDetailData, type TaskProjectPanelViewProps } from "../TaskProjectPanel"

const MEMBERS: TeamMember[] = [
  {
    id: 1, email: "mia@x.au", name: "Mia Tran", role_title: null, active: true, capacity_notes: null, working_style: null,
    default_client_ids: [], created_at: "", updated_at: "",
  },
  {
    id: 2, email: "luke@x.au", name: "Luke", role_title: null, active: true, capacity_notes: null, working_style: null,
    default_client_ids: [], created_at: "", updated_at: "",
  },
]

const DATA: TaskProjectDetailData = {
  task: {
    id: 7, task_type: "task", parent_task_id: null, project_id: 5, section_id: 20, assigned_by_email: "mia@x.au",
    start_on: "2026-11-16", due_on: "2026-11-20", custom_values: { "3": "o2", "4": ["o1"] },
  },
  project: {
    id: 5, kind: "ops", client_id: null, mba_number: null, name: "Digital desk", owner_email: null, is_private: false,
    status: "active", start_on: null, due_on: null, created_by_email: "luke@x.au", created_at: "", updated_at: "", members: [],
  },
  project_hidden: false,
  sections: [
    { id: 10, project_id: 5, name: "Inbound", sort_order: 0, collapsed_default: false, status_category: "todo" },
    { id: 20, project_id: 5, name: "This week", sort_order: 1, collapsed_default: false, status_category: "in_progress" },
  ],
  fields: [
    { id: 3, project_id: 5, name: "Progress", field_type: "single_select", options: [{ id: "o1", label: "Not started" }, { id: "o2", label: "In progress" }], done_option: null },
    { id: 4, project_id: 5, name: "Tags", field_type: "multi_select", options: [{ id: "o1", label: "Meta" }, { id: "o2", label: "Search" }], done_option: null },
  ],
  subtasks: [
    { id: 71, title: "Brief creative", status: "done", assignee_email: "mia@x.au", assignee_name: "Mia Tran", start_on: null, due_on: "2026-11-18", sort_order: 0 },
    { id: 72, title: "Proofs", status: "todo", assignee_email: null, assignee_name: null, start_on: null, due_on: null, sort_order: 1 },
  ],
  parent: null,
}

const noop = () => {}

function props(overrides: Partial<TaskProjectPanelViewProps> = {}): TaskProjectPanelViewProps {
  return {
    data: DATA,
    members: MEMBERS,
    meEmail: "luke@x.au",
    onMoveSection: noop,
    onStartDate: noop,
    onMilestone: noop,
    onFieldValue: noop,
    onAddSubtask: async () => true,
    onToggleSubtask: noop,
    onDeleteSubtask: noop,
    onMoveSubtask: noop,
    ...overrides,
  }
}

describe("TaskProjectPanelView", () => {
  it("project task: project link, section, start date, assigned by (from the server), fields and subtasks with progress", () => {
    const html = renderToStaticMarkup(<TaskProjectPanelView {...props()} />)
    expect(html).toContain('href="/tasks/projects/5"')
    expect(html).toContain("Digital desk")
    expect(html).toContain("Section")
    expect(html).toContain("Start date")
    expect(html).toMatch(/data-testid="assigned-by"[^>]*>Mia Tran</)
    expect(html).toContain("Progress")
    expect(html).toContain("Tags")
    // Multi-select options are toggles; Meta is held.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Meta</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Search</)
    expect(html).toContain("1 of 2 done")
    expect(html).toContain('href="/tasks/71"')
    expect(html).toContain("Brief creative")
    expect(html).toContain("Unassigned")
    expect(html).toContain("Milestone")
  })

  it("assigned by you reads You; not set reads Not set", () => {
    const you = renderToStaticMarkup(
      <TaskProjectPanelView {...props({ data: { ...DATA, task: { ...DATA.task, assigned_by_email: "luke@x.au" } } })} />
    )
    expect(you).toMatch(/data-testid="assigned-by"[^>]*>You</)
    const none = renderToStaticMarkup(
      <TaskProjectPanelView {...props({ data: { ...DATA, task: { ...DATA.task, assigned_by_email: null } } })} />
    )
    expect(none).toContain("Not set")
  })

  it("a subtask: links to its parent, no section, no milestone switch, no subtasks of its own", () => {
    const html = renderToStaticMarkup(
      <TaskProjectPanelView
        {...props({
          data: {
            ...DATA,
            task: { ...DATA.task, task_type: "subtask", parent_task_id: 6, section_id: null },
            parent: { id: 6, title: "Book OOH" },
            subtasks: [],
          },
        })}
      />
    )
    expect(html).toContain("Subtask of Book OOH")
    expect(html).toContain('href="/tasks/6"')
    expect(html).not.toContain(">Section<")
    expect(html).not.toContain("Add a subtask")
    expect(html).not.toContain('aria-label="Milestone"')
  })

  it("a milestone shows its marker; no project says so; a hidden private project shows nothing of it", () => {
    const milestone = renderToStaticMarkup(
      <TaskProjectPanelView {...props({ data: { ...DATA, task: { ...DATA.task, task_type: "milestone" } } })} />
    )
    expect(milestone).toMatch(/>Milestone</)
    const loose = renderToStaticMarkup(
      <TaskProjectPanelView {...props({ data: { ...DATA, project: null, sections: [], fields: [], task: { ...DATA.task, project_id: null } } })} />
    )
    expect(loose).toContain("Not in a project")
    expect(loose).not.toContain(">Section<")
    const hidden = renderToStaticMarkup(
      <TaskProjectPanelView {...props({ data: { ...DATA, project: null, project_hidden: true, sections: [], fields: [], subtasks: [] } })} />
    )
    expect(hidden).toContain("private project")
    expect(hidden).not.toContain("Subtasks")
  })
})

describe("TaskProjectPanel tells the detail whether 0118 answered (B40fix F6: ASAP is offered only then)", () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  async function mount(response: { ok: boolean; status: number; body?: unknown }): Promise<boolean[]> {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: response.ok, status: response.status, json: async () => response.body })))
    const seen: boolean[] = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<TaskProjectPanel taskId={7} members={MEMBERS} meEmail="luke@x.au" onChanged={noop} onLoaded={(v) => seen.push(v)} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    act(() => root.unmount())
    return seen
  }

  it("503 before 0118: not loaded, and the panel renders nothing", async () => {
    expect(await mount({ ok: false, status: 503 })).toEqual([false])
  })

  it("200 after 0118: loaded", async () => {
    expect(await mount({ ok: true, status: 200, body: DATA })).toEqual([true])
  })
})
