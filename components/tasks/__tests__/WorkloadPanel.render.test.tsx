/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { WorkloadTable } from "../WorkloadPanel"

describe("workload table (B42)", () => {
  it("one row per person, this week first, overdue marked", () => {
    const html = renderToStaticMarkup(
      <WorkloadTable
        data={{
          today: "2026-11-13",
          weeks: [
            { start: "2026-11-09", end: "2026-11-15" },
            { start: "2026-11-16", end: "2026-11-22" },
          ],
          people: [
            { email: "mia@x.au", name: "Mia Tran", open: 5, overdue: 2, no_due: 1, by_week: [2, 1], later: 1 },
            { email: "josh@x.au", name: "Josh Patel", open: 0, overdue: 0, no_due: 0, by_week: [0, 0], later: 0 },
          ],
        }}
      />
    )
    expect(html).toContain("This week")
    expect(html).toContain("Week of 16/11")
    expect(html).toContain("Mia Tran")
    expect(html.match(/text-destructive/g)?.length).toBe(1)
  })
  it("says so when nobody is on the list", () => {
    expect(renderToStaticMarkup(<WorkloadTable data={{ today: "2026-11-13", weeks: [], people: [] }} />)).toContain("No active people")
  })
})
