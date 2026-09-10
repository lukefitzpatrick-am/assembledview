import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  deliverablesFromBudget,
  netMediaFromDeliverables,
  roundDeliverables,
} from "../deliverableBudget.js"
import { roundMoneyCents, solveMediaMath } from "../solveMediaMath.js"

function assertOk(result: ReturnType<typeof solveMediaMath>) {
  if (!result.ok) throw new Error(result.reason)
  return result
}

describe("solveMediaMath", () => {
  it("cpm: $50,000 at $12.50 → 4,000,000 impressions; inverts both ways within a cent", () => {
    const d = assertOk(
      solveMediaMath({ buyType: "cpm", budget: 50_000, rate: 12.5 }),
    )
    assert.equal(d.solvedField, "deliverables")
    assert.equal(d.solvedValue, 4_000_000)
    assert.equal(d.triple.deliverables, 4_000_000)
    assert.match(d.formula, /1000/)

    const raw = deliverablesFromBudget("cpm", 50_000, 12.5)
    assert.equal(roundDeliverables("cpm", raw), 4_000_000)

    const fromRate = assertOk(
      solveMediaMath({ buyType: "cpm", budget: 50_000, deliverables: 4_000_000 }),
    )
    assert.equal(fromRate.solvedField, "rate")
    assert.equal(fromRate.solvedValue, 12.5)
    assert.ok(Math.abs(fromRate.triple.rate - 12.5) < 0.01)

    const fromBudget = assertOk(
      solveMediaMath({ buyType: "cpm", rate: 12.5, deliverables: 4_000_000 }),
    )
    assert.equal(fromBudget.solvedField, "budget")
    assert.ok(Math.abs(fromBudget.solvedValue - 50_000) < 0.01)
    assert.ok(
      Math.abs(netMediaFromDeliverables("cpm", 4_000_000, 12.5) - 50_000) < 0.01,
    )
  })

  it("cpm: $30,000 and 2,000,000 impressions → rate 15.00", () => {
    const r = assertOk(
      solveMediaMath({ buyType: "cpm", budget: 30_000, deliverables: 2_000_000 }),
    )
    assert.equal(r.solvedValue, 15)
    assert.equal(roundMoneyCents(15), 15)
  })

  it("cpv: $5,000 / 213,675 views → rate 0.0234 (4 dp, not cents)", () => {
    const r = assertOk(
      solveMediaMath({ buyType: "cpv", budget: 5_000, deliverables: 213_675 }),
    )
    assert.equal(r.solvedField, "rate")
    assert.equal(r.solvedValue, 0.0234)
    assert.notEqual(r.solvedValue, 0.02)
  })

  it("cpc: $1,000 / 19,048 clicks → rate 0.0525 (4 dp)", () => {
    const r = assertOk(
      solveMediaMath({ buyType: "cpc", budget: 1_000, deliverables: 19_048 }),
    )
    assert.equal(r.solvedField, "rate")
    assert.equal(r.solvedValue, 0.0525)
    assert.notEqual(r.solvedValue, 0.05)
  })

  it("cpc: $10,000 at $2.50 → 4,000 clicks; round-trips within a cent", () => {
    const d = assertOk(
      solveMediaMath({ buyType: "cpc", budget: 10_000, rate: 2.5 }),
    )
    assert.equal(d.solvedValue, 4_000)
    const back = assertOk(
      solveMediaMath({ buyType: "cpc", rate: 2.5, deliverables: 4_000 }),
    )
    assert.ok(Math.abs(back.solvedValue - 10_000) < 0.01)
    const rateBack = assertOk(
      solveMediaMath({ buyType: "cpc", budget: 10_000, deliverables: 4_000 }),
    )
    assert.ok(Math.abs(rateBack.solvedValue - 2.5) < 0.01)
  })

  it("cpv: $5,000 at $0.05 → 100,000 views; round-trips within a cent", () => {
    const d = assertOk(
      solveMediaMath({ buyType: "cpv", budget: 5_000, rate: 0.05 }),
    )
    assert.equal(d.solvedValue, 100_000)
    const back = assertOk(
      solveMediaMath({ buyType: "cpv", rate: 0.05, deliverables: 100_000 }),
    )
    assert.ok(Math.abs(back.solvedValue - 5_000) < 0.01)
  })

  it("spots: $12,000 at $500 → 24 spots; round-trips within a cent", () => {
    const d = assertOk(
      solveMediaMath({ buyType: "spots", budget: 12_000, rate: 500 }),
    )
    assert.equal(d.solvedValue, 24)
    const back = assertOk(
      solveMediaMath({ buyType: "spots", rate: 500, deliverables: 24 }),
    )
    assert.ok(Math.abs(back.solvedValue - 12_000) < 0.01)
  })

  it("weekly_rate with weeks: $1,000 × 4 weeks → $4,000", () => {
    const b = assertOk(
      solveMediaMath({ buyType: "weekly_rate", rate: 1_000, weeks: 4 }),
    )
    assert.equal(b.solvedField, "budget")
    assert.equal(b.solvedValue, 4_000)
    assert.equal(b.triple.deliverables, 4)
    const d = assertOk(
      solveMediaMath({ buyType: "weekly_rate", budget: 4_000, rate: 1_000 }),
    )
    assert.equal(d.solvedValue, 4)
  })

  it("monthly_rate with months: $8,000 / 2 months → $4,000 rate", () => {
    const r = assertOk(
      solveMediaMath({ buyType: "monthly_rate", budget: 8_000, months: 2 }),
    )
    assert.equal(r.solvedField, "rate")
    assert.equal(r.solvedValue, 4_000)
  })

  it("refuses three inputs, one input, fixed_cost, rate 0, and negatives", () => {
    const three = solveMediaMath({
      buyType: "cpm",
      budget: 50_000,
      rate: 12.5,
      deliverables: 4_000_000,
    })
    assert.equal(three.ok, false)
    if (!three.ok) assert.match(three.reason, /three|exactly two/i)

    const one = solveMediaMath({ buyType: "cpm", budget: 50_000 })
    assert.equal(one.ok, false)
    if (!one.ok) assert.match(one.reason, /two|missing/i)

    const fixed = solveMediaMath({ buyType: "fixed_cost", budget: 10_000, rate: 10_000 })
    assert.equal(fixed.ok, false)
    if (!fixed.ok) assert.match(fixed.reason, /fixed.?cost/i)

    const zero = solveMediaMath({ buyType: "cpm", budget: 50_000, rate: 0 })
    assert.equal(zero.ok, false)
    if (!zero.ok) assert.match(zero.reason, /zero|0/)

    const neg = solveMediaMath({ buyType: "cpm", budget: -50_000, rate: 12.5 })
    assert.equal(neg.ok, false)
    if (!neg.ok) assert.match(neg.reason, /negative/i)
  })
})
