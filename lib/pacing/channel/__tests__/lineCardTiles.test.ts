import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { lineCardFromSearch } from "../lineCardModel.js"
import { countLineCardTiles, filterLineCardsByTile } from "../lineCardTiles.js"
import { LINE_AS_OF, searchFixture } from "./fixtures.js"

describe("countLineCardTiles", () => {
  it("counts live, pace bands and KPI pending on filtered rows", () => {
    const behind = lineCardFromSearch(
      searchFixture({
        lineItemId: "a",
        spendToDateLineTotal: 2_000,
        spendToDateCurrentBurst: 500,
        kpiTargets: {
          mediaType: "search",
          publisher: null,
          bidStrategy: null,
          ctr: 4,
          cpv: null,
          conversionRate: null,
          vtr: null,
          frequency: null,
        },
      }),
      LINE_AS_OF,
    )
    const pending = lineCardFromSearch(
      searchFixture({
        lineItemId: "b",
        spendToDateLineTotal: 8_500,
        spendToDateCurrentBurst: 4_000,
        kpiTargets: null,
      }),
      LINE_AS_OF,
    )
    const over = lineCardFromSearch(
      searchFixture({
        lineItemId: "c",
        totalLineItemBudget: 10_000,
        spendToDateLineTotal: 12_000,
        spendToDateCurrentBurst: 9_000,
        kpiTargets: null,
      }),
      LINE_AS_OF,
    )
    const counts = countLineCardTiles([behind, pending, over])
    assert.equal(counts.live, 3)
    assert.ok(counts.behind >= 1)
    assert.ok(counts.kpi_pending >= 1)
    assert.ok(counts.over_pacing + counts.ahead + counts.on_track + counts.behind === 3)
    const pendingOnly = filterLineCardsByTile([behind, pending, over], "kpi_pending")
    assert.ok(pendingOnly.every((row) => row.kpiStatus === "kpi-pending"))
  })
})
