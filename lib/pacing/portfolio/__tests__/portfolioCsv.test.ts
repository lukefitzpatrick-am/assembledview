import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { flattenPortfolioCsvRows } from "../portfolioCsv.js"
import { p6FixtureRows } from "./p6Fixture.js"

describe("flattenPortfolioCsvRows", () => {
  it("writes one row per campaign plus one per channel, with a level column", () => {
    const rows = p6FixtureRows()
    const flat = flattenPortfolioCsvRows(rows)
    const channelCount = rows.reduce((n, row) => n + row.channels.length, 0)
    assert.equal(flat.length, rows.length + channelCount)
    assert.equal(flat.filter((row) => row.level === "campaign").length, rows.length)
    assert.equal(flat.filter((row) => row.level === "channel").length, channelCount)
    assert.ok(flat.every((row) => row.level === "campaign" || row.level === "channel"))
  })
})
