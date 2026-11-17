/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { MyWorkTabs } from "../MyWorkTabs"

describe("My Work tabs (B42)", () => {
  it("shows the three tabs with the picked one pressed", () => {
    const html = renderToStaticMarkup(<MyWorkTabs value="assigned_by" onChange={() => {}} />)
    expect(html).toContain("Assigned to me")
    expect(html).toContain("Assigned by me")
    expect(html).toContain("Following")
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1)
    // B48: codex_my_work needs 0118, so there is no "database update" state.
    expect(html).not.toContain("database update")
  })
})
