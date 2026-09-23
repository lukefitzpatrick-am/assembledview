import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { startStageBudget, tickStageBudget } from "../stageBudget"

describe("stage time budget", () => {
  it("returns incomplete at the limit", () => {
    let now = 1_000
    const budget = startStageBudget(40_000, () => now)
    assert.equal(tickStageBudget(budget).status, "running")
    now = 1_000 + 39_999
    assert.equal(tickStageBudget(budget).status, "running")
    now = 1_000 + 40_000
    const atLimit = tickStageBudget(budget)
    assert.equal(atLimit.status, "incomplete")
    if (atLimit.status === "incomplete") {
      assert.equal(atLimit.elapsed_ms, 40_000)
    }
  })
})
