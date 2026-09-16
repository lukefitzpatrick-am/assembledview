import { describe, expect, it } from "vitest"

import { wrapGanttLabel } from "../wrapGanttLabel"

describe("wrapGanttLabel", () => {
  it("keeps a two-line name that fits 44 characters per line without an ellipsis", () => {
    const line1 = "A".repeat(44)
    const line2 = "B".repeat(40)
    const lines = wrapGanttLabel(`${line1} ${line2}`)
    expect(lines).toEqual([line1, line2])
    expect(lines.join(" ")).not.toContain("…")
  })

  it("ellipsizes only when the name exceeds two 44-character lines", () => {
    const line1 = "A".repeat(44)
    const line2 = "B".repeat(44)
    const lines = wrapGanttLabel(`${line1} ${line2} Extra`)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/…$/)
    expect(lines.join(" ").length).toBeLessThan(`${line1} ${line2} Extra`.length)
  })
})
