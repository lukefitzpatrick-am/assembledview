import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { lineCardFromSearch } from "../../channel/lineCardModel.js"
import { LINE_AS_OF, searchFixture } from "../../channel/__tests__/fixtures.js"
import { scenarioLineFromCard, scenarioLinesFromDetail } from "../fromLineCard.js"

describe("scenarioLineFromCard", () => {
  it("maps a search LineCardModel onto ScenarioLine", () => {
    const card = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const line = scenarioLineFromCard(card, LINE_AS_OF, 20_000)
    assert.ok(line)
    assert.equal(line.lineItemId, card.lineItemId)
    assert.equal(line.channel, "search")
    assert.equal(line.budget, card.budget)
    assert.equal(line.spent, card.spend)
    assert.equal(line.yesterday, card.yesterday)
    assert.ok(line.rate)
    assert.equal(line.rate.kind, "cpc")
    assert.ok(line.daysLeft >= 0)
    assert.ok(line.expectedToDate > 0)
  })

  it("skips verification-only cards", () => {
    const card = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const skipped = scenarioLineFromCard({ ...card, verificationOnly: true }, LINE_AS_OF)
    assert.equal(skipped, null)
  })
})

describe("scenarioLinesFromDetail", () => {
  it("maps payload lines and drops verification-only rows", () => {
    const card = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const lines = scenarioLinesFromDetail({
      lines: [card, { ...card, lineItemId: "cm360-1", verificationOnly: true }],
      asOf: LINE_AS_OF,
      expectedToDate: 20_000,
    })
    assert.equal(lines.length, 1)
    assert.equal(lines[0]?.lineItemId, card.lineItemId)
  })
})
