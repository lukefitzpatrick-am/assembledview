import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  filterPortfolioByTile,
  filterPortfolioRows,
  splitPortfolioSections,
} from "../filterPortfolioRows.js"
import { p6FixtureRows } from "./p6Fixture.js"

describe("filterPortfolioRows / tiles / sections", () => {
  const rows = p6FixtureRows()

  it("splits attention campaigns from everything else in route order", () => {
    const { attention, rest } = splitPortfolioSections(rows)
    assert.deepEqual(
      attention.map((row) => row.mbaNumber),
      ["letsgo001", "jayco001", "candel001", "hartm012"],
    )
    assert.deepEqual(
      rest.map((row) => row.mbaNumber),
      ["BICAU002", "PGAAUS014"],
    )
  })

  it("tile Behind keeps only pace=behind", () => {
    assert.deepEqual(
      filterPortfolioByTile(rows, "behind").map((row) => row.mbaNumber),
      ["jayco001"],
    )
  })

  it("tile Over-pacing keeps only the overshoot row", () => {
    assert.deepEqual(
      filterPortfolioByTile(rows, "over_pacing").map((row) => row.mbaNumber),
      ["letsgo001"],
    )
  })

  it("toolbar social filter keeps campaigns with a social channel", () => {
    const filtered = filterPortfolioRows(
      rows,
      { client_ids: [], media_types: ["social"], statuses: [], search: "" },
      new Map(),
    )
    assert.deepEqual(
      filtered.map((row) => row.mbaNumber),
      ["jayco001"],
    )
  })
})
