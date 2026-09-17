import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyScenario } from "../applyScenario.js"
import { JAYCO_AS_OF, JAYCO_LINES, JAYCO_META, JAYCO_SEARCH } from "./jaycoFixture.js"

describe("applyScenario", () => {
  it("Jayco: move $8K and cap search at $164 lands on budget with Sep burst 108%", () => {
    const result = applyScenario(
      JAYCO_LINES,
      {
        moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
        caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
        pauses: [],
        extendDays: 0,
        burstDateChanges: [],
      },
      JAYCO_AS_OF,
    )

    const search = result.lines.find((l) => l.lineItemId === JAYCO_SEARCH.lineItemId)
    const meta = result.lines.find((l) => l.lineItemId === JAYCO_META.lineItemId)
    assert.ok(search)
    assert.ok(meta)

    assert.equal(Math.round(search.remaining), 34_211)
    assert.equal(search.perDayNeeded, 164)
    assert.equal(Math.round(search.projectedFinish), 161_077)
    assert.equal(search.paceAtFinish, "on-track")

    assert.equal(Math.round(meta.remaining), 33_102)
    assert.equal(Math.round(meta.projectedFinish), 50_000)

    assert.ok(search.burst)
    assert.equal(Math.round(search.burst.spend), 16_088)
    assert.equal(Math.round(search.burst.pct), 108)

    assert.equal(result.campaign.budget, 227_904)
    assert.ok(result.campaign.projectedFinish <= result.campaign.budget)
    assert.ok(result.campaign.delta <= 0)

    const clicks = search.projectedDeliverable
    assert.ok(clicks != null)
    assert.ok(Math.abs(clicks - 7_400) < 20)
  })

  it("warns when a move exceeds the source remaining", () => {
    const result = applyScenario(
      JAYCO_LINES,
      {
        moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 50_000 }],
        caps: [],
        pauses: [],
        extendDays: 0,
        burstDateChanges: [],
      },
      JAYCO_AS_OF,
    )
    assert.ok(
      result.warnings.some((w) => /50,?000/.test(w) && /42,?211/.test(w)),
      `expected over-move warning, got: ${result.warnings.join(" | ")}`,
    )
  })

  it("warns when Meta daily is more than 2× yesterday", () => {
    const result = applyScenario(
      JAYCO_LINES,
      {
        moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
        caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
        pauses: [],
        extendDays: 0,
        burstDateChanges: [],
      },
      JAYCO_AS_OF,
    )
    assert.ok(
      result.warnings.some((w) => /2×|2x/i.test(w) && /meta/i.test(w)),
      `expected Meta >2× warning, got: ${result.warnings.join(" | ")}`,
    )
  })

  it("warns when the plan rate is used because no delivered rate exists", () => {
    const planOnly: typeof JAYCO_SEARCH = {
      ...JAYCO_SEARCH,
      rate: { kind: "cpc", value: 2.5, basis: "plan" },
    }
    const result = applyScenario(
      [planOnly],
      { moves: [], caps: [], pauses: [], extendDays: 0, burstDateChanges: [] },
      JAYCO_AS_OF,
    )
    assert.ok(
      result.warnings.some((w) => /plan rate/i.test(w)),
      `expected plan-rate warning, got: ${result.warnings.join(" | ")}`,
    )
  })

  it("pause zeros remaining spend and flags unspent budget", () => {
    const result = applyScenario(
      [JAYCO_META],
      { moves: [], caps: [], pauses: [JAYCO_META.lineItemId], extendDays: 0, burstDateChanges: [] },
      JAYCO_AS_OF,
    )
    const meta = result.lines[0]
    assert.equal(meta.remaining, 0)
    assert.equal(meta.projectedFinish, JAYCO_META.spent)
    assert.ok(meta.notes.some((n) => /unspent/i.test(n) && /25,?102/.test(n)))
  })

  it("extendDays adds to every line daysLeft and end date", () => {
    const result = applyScenario(
      JAYCO_LINES,
      { moves: [], caps: [], pauses: [], extendDays: 14, burstDateChanges: [] },
      JAYCO_AS_OF,
    )
    for (const line of result.lines) {
      assert.equal(line.perDayNeeded > 0 || line.remaining === 0, true)
    }
    const search = result.lines.find((l) => l.lineItemId === JAYCO_SEARCH.lineItemId)!
    assert.ok(search.notes.some((n) => /14/.test(n) && /extend/i.test(n)) || search.perDayNeeded < 42211 / 106)
    assert.ok(Math.abs(search.perDayNeeded - 42_211 / 120) < 0.01)
  })
})
