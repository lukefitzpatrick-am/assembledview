import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { groupPacingRowsByPlacement } from "../channels/directDigitalAdapterShared"
import { AdGroupBreakdownTable } from "../shared/AdGroupBreakdownTable"
import { EntityBreakdownTable } from "../shared/EntityBreakdownTable"

// tsx compiles imported .tsx with classic JSX (tsconfig jsx: preserve).
;(globalThis as unknown as { React: typeof React }).React = React

describe("groupPacingRowsByPlacement", () => {
  it("a line item with 3 placements produces 3 rows, summed per placement", () => {
    const rows = groupPacingRowsByPlacement([
      {
        entityId: "plc-a",
        entityName: "Homepage MPU",
        impressions: 100,
        clicks: 10,
        results: 2,
        video3sViews: 8,
      },
      {
        entityId: "PLC-A",
        entityName: "",
        impressions: 50,
        clicks: 5,
        results: 1,
        video3sViews: 4,
      },
      {
        entityId: "plc-b",
        entityName: "Ros banner",
        impressions: 20,
        clicks: 2,
        results: 0,
        video3sViews: 1,
      },
      {
        entityId: "plc-c",
        entityName: "Preroll",
        impressions: 7,
        clicks: 1,
        results: 3,
        video3sViews: 6,
      },
      {
        entityId: "  ",
        entityName: "unknown should drop",
        impressions: 999,
        clicks: 999,
        results: 999,
        video3sViews: 999,
      },
      {
        entityId: null,
        entityName: "also drop",
        impressions: 1,
        clicks: 1,
        results: 1,
        video3sViews: 1,
      },
    ])

    assert.equal(rows.length, 3)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    assert.equal(byId["plc-a"]?.name, "Homepage MPU")
    assert.equal(byId["plc-a"]?.impressions, 150)
    assert.equal(byId["plc-a"]?.clicks, 15)
    assert.equal(byId["plc-a"]?.videoCompletes, 12)
    assert.equal(byId["plc-b"]?.name, "Ros banner")
    assert.equal(byId["plc-b"]?.impressions, 20)
    assert.equal(byId["plc-c"]?.name, "Preroll")
    assert.equal(byId["plc-c"]?.impressions, 7)
    assert.equal(
      rows.some((r) => /unknown|also drop/i.test(r.name)),
      false,
    )
  })
})

describe("EntityBreakdownTable columns", () => {
  it("the delivery column set renders NO spend and NO CPC cell", () => {
    const html = renderToStaticMarkup(
      createElement(EntityBreakdownTable, {
        rows: [
          {
            name: "Homepage MPU",
            impressions: 150,
            clicks: 15,
            videoCompletes: 12,
          },
        ],
        knownPlanLineIds: ["mba001dd1"],
        entityNoun: { singular: "placement", plural: "placements" },
        columns: "delivery",
        defaultOpen: true,
      }),
    )

    assert.match(html, />Placement</)
    assert.match(html, />Impressions</)
    assert.match(html, />Clicks</)
    assert.match(html, />CTR</)
    assert.match(html, />Video completions</)
    assert.match(html, />Completion rate</)
    assert.match(html, /8\.00%/)
    assert.match(
      html,
      /Impressions, clicks, CTR, video completions and completion rate only/,
    )
    assert.equal(html.includes(">Spend<"), false)
    assert.equal(html.includes(">CPC<"), false)
    assert.equal(html.includes("$"), false)
    assert.match(html, /Show 1 placements|Hide 1 placements/)
  })

  it("search still renders its 6 columns unchanged (regression)", () => {
    const html = renderToStaticMarkup(
      createElement(AdGroupBreakdownTable, {
        rows: [
          { name: "Brand - exact", spend: 12.5, clicks: 4, impressions: 200 },
          { name: "Generic - phrase", spend: 3, clicks: 1, impressions: 80 },
        ],
        knownPlanLineIds: ["mba001se1"],
        defaultOpen: true,
      }),
    )

    assert.match(html, />Ad group</)
    assert.match(html, />Spend</)
    assert.match(html, />Clicks</)
    assert.match(html, />Impressions</)
    assert.match(html, />CPC</)
    assert.match(html, />CTR</)
    assert.match(html, /Hide 2 ad groups/)
    assert.match(
      html,
      /Ad group delivery actuals for this search line item\. Spend, clicks, impressions, CPC and CTR only/,
    )
    assert.equal(html.includes(">Video completions<"), false)
    assert.equal(html.includes(">Completion rate<"), false)
    assert.equal(html.includes(">Placement<"), false)
  })
})
