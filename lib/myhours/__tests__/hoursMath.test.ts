import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  minutesToHours,
  sumMinutesToHours,
} from "../hoursMath.js"

describe("minutesToHours", () => {
  it("rounds to one decimal (commercial display)", () => {
    assert.equal(minutesToHours(0), 0)
    assert.equal(minutesToHours(30), 0.5)
    assert.equal(minutesToHours(60), 1)
    assert.equal(minutesToHours(90), 1.5)
    // 65 min = 1.083… → 1.1
    assert.equal(minutesToHours(65), 1.1)
    // 61 min = 1.016… → 1.0
    assert.equal(minutesToHours(61), 1)
  })

  it("never returns NaN for finite non-negative input", () => {
    assert.equal(Number.isFinite(minutesToHours(0)), true)
    assert.equal(minutesToHours(-5), 0)
  })
})

describe("sumMinutesToHours", () => {
  it("sums then rounds once (not per-row)", () => {
    // 20 + 20 + 20 = 60 → 1.0 (not 0.3+0.3+0.3=0.9)
    assert.equal(sumMinutesToHours([20, 20, 20]), 1)
  })
})
