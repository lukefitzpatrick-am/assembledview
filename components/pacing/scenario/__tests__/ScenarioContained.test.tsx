/** @vitest-environment jsdom */
/**
 * B44 (C-200, switch codex_contained_writes): the scenario planner.
 * Off: Create Codex task posts the draft, as before. On: the campaign's tasks
 * read only (one GET through the visibility rule), New task in Tasks filled in
 * from the scenario and Open in Tasks; nothing is posted.
 */
import fs from "node:fs"
import path from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseTasksComposeParams } from "@/lib/codex/composeLink"
import { JAYCO_AS_OF, JAYCO_LINES } from "@/lib/pacing/scenario/__tests__/jaycoFixture"
import { ScenarioPlannerPanel } from "../ScenarioPlannerPanel"

describe("Scenario planner containment (B44, C-200)", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 11, title: "Swap Jayco creative", status: "in_progress", assignee_name: "Alex", due_date: "2026-11-20", parent_task_id: null },
          { id: 12, title: "Check caps", status: "todo", assignee_email: "brad@x.au", due_date: null, parent_task_id: null },
        ],
        itemsTotal: 14,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function renderPanel(props: Partial<React.ComponentProps<typeof ScenarioPlannerPanel>> = {}) {
    await act(async () => {
      root.render(
        <ScenarioPlannerPanel
          mba="jayco001"
          campaignName="Jayco AU"
          versionNumber={14}
          asOf={JAYCO_AS_OF}
          lines={JAYCO_LINES}
          {...props}
        />,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  it("switch off: Create Codex task posts the scenario draft; no tasks list", async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined)
    await renderPanel({ onCreateTask })
    expect(container.textContent).not.toContain("Tasks for this campaign")
    expect(container.textContent).not.toContain("New task in Tasks")
    const create = [...container.querySelectorAll("button")].find((el) => el.textContent === "Create Codex task")
    expect(create).toBeTruthy()
    act(() => create!.click())
    expect(onCreateTask).toHaveBeenCalledTimes(1)
    expect(onCreateTask.mock.calls[0][0]).toMatchObject({ title: "Apply scenario: Jayco AU", mba_number: "jayco001", category: "pacing" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("switch on: tasks read only, links into Tasks, nothing posted", async () => {
    const onCreateTask = vi.fn()
    await renderPanel({ containedTasks: { clientId: 42 }, onCreateTask })
    expect([...container.querySelectorAll("button")].some((el) => el.textContent === "Create Codex task")).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toBe("/api/codex/tasks?mba_number=jayco001&per_page=10")
    expect(init?.method ?? "GET").toBe("GET")

    expect(container.textContent).toContain("Tasks for this campaign")
    expect(container.textContent).toContain("Swap Jayco creative")
    expect(container.textContent).toContain("In progress")
    expect(container.textContent).toContain("brad@x.au")
    expect(container.textContent).toContain("Showing 2 of 14. Open in Tasks for the rest.")
    expect(container.querySelector('a[href="/tasks/11"]')).toBeTruthy()
    // Read only: no buttons, inputs or forms inside the tasks list.
    const section = container.querySelector('section[aria-label="Tasks for this campaign"]')!
    expect(section.querySelectorAll("button, input, select, textarea, form")).toHaveLength(0)

    const open = [...container.querySelectorAll("a")].find((el) => el.textContent === "Open in Tasks")
    expect(open?.getAttribute("href")).toBe("/tasks?mba=jayco001")
    const fresh = [...container.querySelectorAll("a")].find((el) => el.textContent === "New task in Tasks")
    const parsed = parseTasksComposeParams(new URL(fresh!.getAttribute("href")!, "https://app.test").searchParams)
    expect(parsed.compose).toBe("task")
    expect(parsed.notes).toEqual([])
    expect(parsed.prefill).toMatchObject({
      title: "Apply scenario: Jayco AU",
      clientId: 42,
      mbaNumber: "jayco001",
      category: "pacing",
    })
    expect(parsed.prefill.description).toContain("Apply the planned scenario on Jayco AU (jayco001).")
    expect(onCreateTask).not.toHaveBeenCalled()
  })

  it("switch on: a refused read says so quietly", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    await renderPanel({ containedTasks: { clientId: null } })
    expect(container.textContent).toContain("Tasks are not available here.")
    const fresh = [...container.querySelectorAll("a")].find((el) => el.textContent === "New task in Tasks")
    expect(fresh!.getAttribute("href")).not.toContain("pf_client")
  })

  it("source: both planner hosts post only with the switch off and pass containedTasks only with it on", () => {
    for (const file of ["ScenarioPlannerContext.tsx", "ScenarioPlannerDrawer.tsx"]) {
      const src = fs.readFileSync(path.join(process.cwd(), "components/pacing/scenario", file), "utf8")
      expect(src, file).toContain("const containedWrites = codexContainedWritesOn()")
      expect(src, file).toContain("containedTasks={containedWrites ? { clientId: payload.clientId ?? null } : undefined}")
      expect(src, file).toContain("onCreateTask={containedWrites ? undefined : async (draft) => {")
    }
  })
})
