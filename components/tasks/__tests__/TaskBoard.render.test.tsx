/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexSection } from "@/lib/codex/projects"
import type { CodexTask } from "@/lib/codex/types"

import { GenericTaskBoard, TaskBoard } from "../TaskBoard"

const SECTIONS: CodexSection[] = [
  { id: 30, project_id: 5, name: "Done", sort_order: 2, collapsed_default: false, status_category: "done" },
  { id: 10, project_id: 5, name: "Inbound", sort_order: 0, collapsed_default: false, status_category: "todo" },
  { id: 20, project_id: 5, name: "This week", sort_order: 1, collapsed_default: false, status_category: "in_progress" },
]

const task = (id: number, title: string, extra: Partial<CodexTask> = {}): CodexTask => ({
  id,
  title,
  client_id: 42,
  status: "todo",
  ...extra,
})

const noop = () => {}

function positions(html: string, needles: string[]): number[] {
  return needles.map((n) => html.indexOf(n))
}

describe("TaskBoard (B39 generic over the column source)", () => {
  it("status source: the five status columns, cards in their status column, client shown", () => {
    const html = renderToStaticMarkup(
      <TaskBoard
        columns={{ backlog: [], todo: [task(1, "Write brief")], in_progress: [], waiting: [], done: [task(2, "Shipped", { status: "done" })] }}
        counts={{ backlog: 0, todo: 1, in_progress: 0, waiting: 0, done: 1 }}
        onLoadMore={noop}
        clientNameById={new Map([[42, "Krusty Krab"]])}
        onOpenTask={noop}
        onStatusChange={noop}
        teamMembers={[]}
        meEmail={null}
      />
    )
    const p = positions(html, ["Backlog", "To do", "In progress", "Waiting", "Done"])
    expect(p.every((x) => x >= 0)).toBe(true)
    expect([...p].sort((a, b) => a - b)).toEqual(p)
    expect(html).toContain("Krusty Krab")
    expect(html.indexOf("Write brief")).toBeLessThan(html.indexOf('data-column="in_progress"'))
    expect(html.indexOf("Shipped")).toBeGreaterThan(html.indexOf('data-column="done"'))
  })

  it("sections source: sections in sort_order with their status, cards in the given order, card counts, menu and footer slots", () => {
    const html = renderToStaticMarkup(
      <GenericTaskBoard
        source={{ kind: "sections", sections: SECTIONS }}
        columns={{
          "section:10": [
            task(3, "Second by sort", { section_id: 10, subtask_count: 2, comment_count: 1, due_date: "2020-01-02" }),
            task(1, "First by sort", { section_id: 10 }),
          ],
          "section:20": [],
          "section:30": [],
        }}
        counts={{ "section:10": 5, "section:20": 0, "section:30": 0 }}
        onLoadMore={noop}
        clientNameFor={() => null}
        onOpenTask={noop}
        onMove={noop}
        collapsedKeys={new Set(["section:30"])}
        teamMembers={[]}
        meEmail={null}
        renderColumnMenu={(c) => <span>menu-for-{c.label}</span>}
        renderColumnFooter={(c) => <span>add-to-{c.label}</span>}
      />
    )
    const cols = positions(html, ['data-column="section:10"', 'data-column="section:20"', 'data-column="section:30"'])
    expect([...cols].sort((a, b) => a - b)).toEqual(cols)
    expect(html).toContain("Inbound")
    expect(html).toContain("This week")
    expect(html).toContain("In progress")
    // Server order kept: no re-sort by due date.
    expect(html.indexOf("Second by sort")).toBeLessThan(html.indexOf("First by sort"))
    expect(html).toContain("Overdue")
    expect(html).toContain('title="2 subtasks"')
    expect(html).toContain('title="1 comment"')
    expect(html).toContain("Load more (3 left)")
    expect(html).not.toContain("Krusty Krab")
    expect(html).toContain("menu-for-Inbound")
    expect(html).toContain("add-to-Inbound")
    // The collapsed Done column keeps its menu but no footer or cards.
    expect(html).toContain('data-collapsed="true"')
    expect(html).toContain("menu-for-Done")
    expect(html).not.toContain("add-to-Done")
  })
})
