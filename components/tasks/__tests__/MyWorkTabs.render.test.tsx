/** @vitest-environment jsdom */
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { MyWorkTabs } from "../MyWorkTabs"
import { projectsReadyFromResponses } from "@/lib/codex/queryHelpers"

describe("My Work tabs (B42)", () => {
  it("shows the three tabs with the picked one pressed", () => {
    const html = renderToStaticMarkup(<MyWorkTabs value="assigned_by" projectsReady onChange={() => {}} />)
    expect(html).toContain("Assigned to me")
    expect(html).toContain("Assigned by me")
    expect(html).toContain("Following")
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(html).not.toContain("database update")
  })

  it("says Assigned by me and Following need the update before 0118", () => {
    expect(renderToStaticMarkup(<MyWorkTabs value="following" projectsReady={false} onChange={() => {}} />)).toContain("need a database update")
    expect(renderToStaticMarkup(<MyWorkTabs value="assigned" projectsReady={false} onChange={() => {}} />)).not.toContain("database update")
  })
})

describe("C-266 (B43): the board layout reads projects_ready too", () => {
  it("projectsReadyFromResponses: any column saying so counts; none loaded keeps the previous value", () => {
    expect(projectsReadyFromResponses([{ projects_ready: false }, { projects_ready: true }], false)).toBe(true)
    expect(projectsReadyFromResponses([{ projects_ready: false }, {}], true)).toBe(false)
    expect(projectsReadyFromResponses([{}], true)).toBe(false)
    expect(projectsReadyFromResponses([{ projects_ready: "true" }], false)).toBe(false)
    expect(projectsReadyFromResponses([], true)).toBe(true)
    expect(projectsReadyFromResponses([], false)).toBe(false)
  })

  it("TasksPageClient: the board fetch sets projectsReady from its columns and the tabs get it on either layout", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/tasks/TasksPageClient.tsx"), "utf8")
    expect(src).toContain("setProjectsReady((prev) => projectsReadyFromResponses(columnBodies, prev))")
    expect(src).toMatch(/<MyWorkTabs[\s\S]*?projectsReady=\{projectsReady\}/)
    expect(src).not.toContain('tasksLayout !== "list" || projectsReady')
  })
})
