import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyScenario } from "../applyScenario.js"
import { backOnTrackPlan } from "../backOnTrackPlan.js"
import { kpiGoalPerDay } from "../kpiGoalPerDay.js"
import { narrate } from "../narrate.js"
import { BICAU002_CHANNEL_FACTORY, JAYCO_AS_OF, JAYCO_LINES, JAYCO_META, JAYCO_SEARCH } from "./jaycoFixture.js"

describe("narrate", () => {
  it("leads with the Jayco outcome, numbers flat, no hedging", () => {
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
    const text = narrate(result)
    assert.match(text, /on budget/i)
    assert.match(text, /8,000|8000/)
    assert.match(text, /164/)
    assert.match(text, /108/)
    assert.doesNotMatch(text, /unfortunately|might|perhaps|sorry/i)
    assert.doesNotMatch(text, /!/)
  })

  it("narrates Calculator A from the verdict", () => {
    const text = narrate(kpiGoalPerDay(BICAU002_CHANNEL_FACTORY, 444_444))
    assert.match(text, /2,808/)
    assert.match(text, /early/i)
    assert.doesNotMatch(text, /unfortunately|might/i)
  })

  it("narrates Calculator B from the feasibility", () => {
    const text = narrate(backOnTrackPlan(JAYCO_META, 14))
    assert.match(text, /7,512/)
    assert.match(text, /942/)
    assert.match(text, /unlikely/i)
    assert.doesNotMatch(text, /unfortunately|might/i)
  })
})
