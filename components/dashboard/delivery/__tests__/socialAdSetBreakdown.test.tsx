import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  groupPacingRowsByAdSet,
  socialBreakdownNoun,
  socialEntityBreakdownProps,
} from "../channels/socialAdapterShared"
import { EntityBreakdownTable } from "../shared/EntityBreakdownTable"

// tsx compiles imported .tsx with classic JSX (tsconfig jsx: preserve).
;(globalThis as unknown as { React: typeof React }).React = React

describe("social ad-set breakdown", () => {
  it("a Meta line item with 2 ad sets produces 2 rows with spend/CPC/CTR populated", () => {
    const grouped = groupPacingRowsByAdSet([
      {
        entityId: "as-1",
        entityName: "Prospecting 25-44",
        amountSpent: 40,
        impressions: 1000,
        clicks: 20,
      },
      {
        entityId: "AS-1",
        entityName: "",
        amountSpent: 10,
        impressions: 250,
        clicks: 5,
      },
      {
        entityId: "as-2",
        entityName: "Retargeting purchasers",
        amountSpent: 8,
        impressions: 400,
        clicks: 8,
      },
    ])

    assert.equal(grouped.length, 2)
    const byId = Object.fromEntries(grouped.map((r) => [r.id, r]))
    assert.equal(byId["as-1"]?.name, "Prospecting 25-44")
    assert.equal(byId["as-1"]?.spend, 50)
    assert.equal(byId["as-1"]?.impressions, 1250)
    assert.equal(byId["as-1"]?.clicks, 25)
    assert.equal(byId["as-2"]?.spend, 8)

    const html = renderToStaticMarkup(
      createElement(EntityBreakdownTable, {
        rows: grouped,
        knownPlanLineIds: ["mba001so1"],
        entityNoun: socialBreakdownNoun("meta"),
        columns: "spend",
        defaultOpen: true,
      }),
    )

    assert.match(html, />Ad set</)
    assert.match(html, />Spend</)
    assert.match(html, />CPC</)
    assert.match(html, />CTR</)
    assert.match(html, /Hide 2 ad sets/)
    assert.match(html, /\$/)
    assert.equal(html.includes(">—<"), false)
    assert.equal(html.includes(">Video completions<"), false)
  })

  it("a TikTok line item labels the table \"ad groups\"", () => {
    const props = socialEntityBreakdownProps(
      "tiktok",
      [
        {
          entityId: "ag-9",
          entityName: "Spark ads — AU",
          amountSpent: 12,
          impressions: 300,
          clicks: 6,
        },
      ],
      ["mba001so2"],
    )
    assert.ok(props)
    assert.deepEqual(props!.entityNoun, { singular: "ad group", plural: "ad groups" })
    assert.equal(props!.columns, "spend")

    const html = renderToStaticMarkup(
      createElement(EntityBreakdownTable, {
        ...props!,
        defaultOpen: true,
      }),
    )
    assert.match(html, /Hide 1 ad groups/)
    assert.match(html, />Ad group</)
    assert.equal(html.includes(">Ad set<"), false)
  })

  it("a line item whose rows all have a blank entityId renders no table (not an empty one)", () => {
    const blankRows = [
      { entityId: "", entityName: "orphan", amountSpent: 9, impressions: 10, clicks: 1 },
      { entityId: "  ", entityName: "also blank", amountSpent: 9, impressions: 10, clicks: 1 },
      { entityId: null, entityName: "null id", amountSpent: 9, impressions: 10, clicks: 1 },
    ]
    assert.equal(groupPacingRowsByAdSet(blankRows).length, 0)
    assert.equal(socialEntityBreakdownProps("meta", blankRows, ["mba001so1"]), undefined)
  })
})
