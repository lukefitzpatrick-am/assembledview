/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexProject, CodexSection } from "@/lib/codex/projects"

import type { CodexCustomField } from "@/lib/codex/customFields"

import { boardLoadFailure, cardChipLabels } from "../ProjectBoardClient"
import { moveOptionDraft, optionLabelsFromText, ProjectFieldsEditor } from "../ProjectFieldsDialog"
import { pastePreviewText } from "../ProjectBoardDialogs"
import { ProjectBoardView, type ProjectBoardViewProps } from "../ProjectBoardView"

const PROJECT: CodexProject = {
  id: 5,
  kind: "ops",
  client_id: null,
  mba_number: "sinch001",
  name: "Digital desk",
  owner_email: "luke@x.au",
  is_private: true,
  status: "active",
  start_on: null,
  due_on: null,
  created_by_email: "luke@x.au",
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z",
  members: [],
}

const SECTIONS: CodexSection[] = [
  { id: 10, project_id: 5, name: "Inbound", sort_order: 0, collapsed_default: false, status_category: "todo" },
  { id: 20, project_id: 5, name: "Awaiting support", sort_order: 1, collapsed_default: false, status_category: "waiting" },
  { id: 30, project_id: 5, name: "Done", sort_order: 2, collapsed_default: false, status_category: "done" },
]

const noop = () => {}

function props(overrides: Partial<ProjectBoardViewProps> = {}): ProjectBoardViewProps {
  return {
    project: PROJECT,
    sections: SECTIONS,
    board: {
      columns: {
        "section:10": [{ id: 1, title: "Book OOH", client_id: 0, status: "todo", section_id: 10, priority: "asap" }],
        "section:20": [],
        "section:30": [],
      },
      counts: { "section:10": 1, "section:20": 0, "section:30": 0 },
    },
    liveCounts: { "section:10": 1, "section:20": 0, "section:30": 4 },
    completedCounts: { "section:30": 4 },
    unsectionedCount: 0,
    hideCompleted: true,
    onHideCompletedChange: noop,
    collapsedKeys: new Set(),
    loadingMoreKey: null,
    onLoadMore: noop,
    onOpenTask: noop,
    onCardMove: noop,
    onAddSection: noop,
    onInlineAdd: async () => true,
    onRename: noop,
    onMove: noop,
    onToggleCollapse: noop,
    onSetCategory: noop,
    onDelete: noop,
    onPaste: noop,
    ...overrides,
  }
}

describe("project board (B39)", () => {
  it("renders the project, its sections as columns with their status, cards, menus and inline add", () => {
    const html = renderToStaticMarkup(<ProjectBoardView {...props()} />)
    expect(html).toContain("Digital desk")
    expect(html).toContain("sinch001")
    expect(html).toContain("Private")
    expect(html).toContain('aria-label="Digital desk board"')
    const cols = ['data-column="section:10"', 'data-column="section:20"', 'data-column="section:30"'].map((c) => html.indexOf(c))
    expect(cols.every((x) => x >= 0)).toBe(true)
    expect([...cols].sort((a, b) => a - b)).toEqual(cols)
    expect(html).toContain("Awaiting support")
    expect(html).toContain("Waiting")
    expect(html).toContain("Book OOH")
    expect(html).toContain("ASAP")
    expect(html).toContain('aria-label="Section menu: Inbound"')
    expect(html).toContain('aria-label="Section menu: Done"')
    expect(html.match(/Add task/g)?.length).toBe(3)
    expect(html).toContain('aria-label="Paste tasks into Awaiting support"')
    expect(html).toContain("Hide completed")
    expect(html).toContain("(4 hidden)")
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('href="/tasks?tab=projects"')
  })

  it("shows completed when the toggle is off, and says when tasks have no section", () => {
    const html = renderToStaticMarkup(
      <ProjectBoardView {...props({ hideCompleted: false, completedCounts: {}, unsectionedCount: 2 })} />
    )
    expect(html).not.toContain("hidden)")
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain("2 tasks are in this project without a section")
  })

  it("a collapsed section keeps its menu and drops its footer", () => {
    const html = renderToStaticMarkup(<ProjectBoardView {...props({ collapsedKeys: new Set(["section:20"]) })} />)
    expect(html).toContain('data-collapsed="true"')
    expect(html).toContain('aria-label="Section menu: Awaiting support"')
    expect(html).not.toContain('aria-label="Paste tasks into Awaiting support"')
  })

  it("load failures: 404 not found, else an error (B48: no pre-0118 state, the switch needs 0118)", () => {
    expect(boardLoadFailure(503).kind).toBe("error")
    expect(boardLoadFailure(404)).toEqual({ kind: "not_found" })
    expect(boardLoadFailure(403)).toEqual({ kind: "error", message: "Codex is available to admins only." })
    expect(boardLoadFailure(500).kind).toBe("error")
  })

  it("paste preview: the count before saving, blanks ignored, over 200 refused", () => {
    expect(pastePreviewText("A\n\nB\n", "Inbound")).toEqual({ message: "2 tasks will be added to Inbound. 1 blank line ignored.", canSave: true })
    expect(pastePreviewText("   ", "Inbound").canSave).toBe(false)
    const over = pastePreviewText(Array.from({ length: 201 }, (_, i) => `t${i}`).join("\n"), "Inbound")
    expect(over.canSave).toBe(false)
    expect(over.message).toContain("up to 200")
    expect(pastePreviewText(`ok\n${"x".repeat(301)}`, "Inbound")).toEqual({ message: "Line 2 is longer than 300 characters.", canSave: false })
  })

  it("B40: a milestone card shows its marker and field chips show on cards; the Fields button opens settings", () => {
    const html = renderToStaticMarkup(
      <ProjectBoardView
        {...props({
          board: {
            columns: {
              "section:10": [
                { id: 1, title: "Creative swap live", client_id: 0, status: "todo", section_id: 10, task_type: "milestone", custom_values: { "3": "o2" } },
                { id: 2, title: "Plain", client_id: 0, status: "todo", section_id: 10 },
              ],
              "section:20": [],
              "section:30": [],
            },
            counts: { "section:10": 2, "section:20": 0, "section:30": 0 },
          },
          cardChips: (task) => (Number(task.id) === 1 ? ["In progress", "Meta"] : []),
          onOpenFields: noop,
        })}
      />
    )
    expect(html.match(/data-testid="card-chips"/g)?.length).toBe(1)
    expect(html).toContain(">Milestone<")
    expect(html).toContain(">In progress<")
    expect(html).toContain(">Meta<")
    expect(html).toContain(">Fields<")
  })
})

const FIELDS: CodexCustomField[] = [
  { id: 3, project_id: 5, name: "Progress", field_type: "single_select", options: [{ id: "o1", label: "Not started" }, { id: "o2", label: "In progress" }], done_option: "o2" },
  { id: 4, project_id: 5, name: "Tags", field_type: "multi_select", options: [{ id: "o1", label: "Meta" }, { id: "o2", label: "Search" }], done_option: null },
]

describe("project fields (B40)", () => {
  it("card chips follow the project's show or hide setting, in field order, labels in option order", () => {
    const task = { custom_values: { "3": "o2", "4": ["o2", "o1"] } }
    expect(cardChipLabels(FIELDS, [], task)).toEqual(["In progress", "Meta", "Search"])
    expect(cardChipLabels(FIELDS, [{ key: "field:3", show: false }], task)).toEqual(["Meta", "Search"])
    expect(cardChipLabels(FIELDS, [], { custom_values: null })).toEqual([])
  })

  it("the settings list each field with its type, options, done option, card switch and delete; and an add form", () => {
    const html = renderToStaticMarkup(
      <ProjectFieldsEditor fields={FIELDS} cardFields={[{ key: "field:4", show: false }]} onCreate={async () => true} onUpdate={async () => true} onDelete={noop} onToggleCard={noop} />
    )
    expect(html).toContain("Single-select")
    expect(html).toContain("Multi-select")
    expect(html).toContain('aria-label="Show Progress on cards"')
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Show Progress on cards"|aria-label="Show Progress on cards"[^>]*aria-checked="true"/)
    expect(html).toMatch(/aria-checked="false"[^>]*aria-label="Show Tags on cards"|aria-label="Show Tags on cards"[^>]*aria-checked="false"/)
    expect(html).toContain('aria-label="Done option of Progress"')
    expect(html).not.toContain('aria-label="Done option of Tags"')
    expect(html).toContain('aria-label="Delete Tags"')
    expect(html).toContain("Add a field")
    const empty = renderToStaticMarkup(
      <ProjectFieldsEditor fields={[]} cardFields={[]} onCreate={async () => true} onUpdate={async () => true} onDelete={noop} onToggleCard={noop} />
    )
    expect(empty).toContain("No fields yet")
  })

  it("option helpers: one per line, blanks dropped; moves stop at the ends", () => {
    expect(optionLabelsFromText(" Not started\n\n In  progress \r\nDone")).toEqual(["Not started", "In progress", "Done"])
    const list = [{ id: "o1", label: "a" }, { id: null, label: "b" }]
    expect(moveOptionDraft(list, 1, -1).map((o) => o.label)).toEqual(["b", "a"])
    expect(moveOptionDraft(list, 0, -1).map((o) => o.label)).toEqual(["a", "b"])
  })
})
