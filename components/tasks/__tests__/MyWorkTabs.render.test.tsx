/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { MyWorkTabs } from "../MyWorkTabs"

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
