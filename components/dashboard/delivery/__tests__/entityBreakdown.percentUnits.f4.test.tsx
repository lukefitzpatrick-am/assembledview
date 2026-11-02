import assert from "node:assert/strict"
import { describe, it } from "vitest"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { EntityBreakdownTable } from "../shared/EntityBreakdownTable"

;(globalThis as unknown as { React: typeof React }).React = React

/**
 * B3 (F4, MATH-10): completion rate and CTR are decimal ratios. Completes can
 * exceed impressions in real data; 120 of 100 is 120.00%, not "1.20%".
 */
function cells(row: { impressions: number; clicks: number; videoCompletes: number }) {
  const html = renderToStaticMarkup(
    createElement(EntityBreakdownTable, {
      rows: [{ name: "Homepage MPU", ...row }],
      knownPlanLineIds: ["mba001dd1"],
      entityNoun: { singular: "placement", plural: "placements" },
      columns: "delivery",
      defaultOpen: true,
    }),
  )
  return [...html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1])
}

describe("EntityBreakdownTable percents (F4)", () => {
  it("a completion rate above 100% shows as 120.00%", () => {
    const c = cells({ impressions: 100, clicks: 1, videoCompletes: 120 })
    assert.ok(c.includes("120.00%"), c.join(" | "))
    assert.ok(!c.includes("1.20%"), c.join(" | "))
  })

  it("exactly 100% and a small CTR", () => {
    const c = cells({ impressions: 200, clicks: 1, videoCompletes: 200 })
    assert.ok(c.includes("100.00%"), c.join(" | "))
    assert.ok(c.includes("0.50%"), c.join(" | "))
  })
})
