import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { backOnTrackPlan } from "../backOnTrackPlan.js"
import { kpiGoalPerDay } from "../kpiGoalPerDay.js"
import { BICAU002_CHANNEL_FACTORY, JAYCO_META } from "./jaycoFixture.js"

describe("kpiGoalPerDay", () => {
  it("BICAU002 Channel Factory: 444,444 goal → 2,808/day, early", () => {
    const result = kpiGoalPerDay(BICAU002_CHANNEL_FACTORY, 444_444)
    assert.equal(Math.round(result.needed), 106_698)
    assert.equal(Math.round(result.perDay), 2_808)
    assert.equal(Math.round(result.runRate), 7_036)
    assert.ok(Math.abs(result.impliedDailySpend - 2_808 * 0.06) < 1)
    assert.equal(result.daysToGoalAtRunRate, 16)
    assert.equal(result.verdict, "early")
    assert.match(result.text, /2,808/)
  })

  it("defaults the goal to the planned deliverable", () => {
    const result = kpiGoalPerDay(BICAU002_CHANNEL_FACTORY)
    assert.equal(Math.round(result.needed), 106_698)
    assert.equal(result.verdict, "early")
  })

  it("converts a VTR target into a views goal from impressions", () => {
    const line = {
      ...BICAU002_CHANNEL_FACTORY,
      deliverable: { unit: "impressions" as const, delivered: 1_000_000, planned: 2_000_000 },
    }
    const result = kpiGoalPerDay(line, { kpi: { metric: "vtr", target: 0.25 } })
    assert.equal(result.needed, 2_000_000 * 0.25 - 0)
    assert.equal(Math.round(result.perDay), Math.round((500_000) / 38))
  })
})

describe("backOnTrackPlan", () => {
  it("Jayco Meta: $7,512 gap in 14 days → $942/day, unlikely", () => {
    const result = backOnTrackPlan(JAYCO_META, 14)
    assert.equal(Math.round(result.gap), 7_512)
    assert.equal(Math.round(result.dailyForPeriod), 942)
    assert.equal(result.thenPlanDaily, 405)
    assert.ok(result.multipleOfYesterday > 20)
    assert.equal(result.feasibility, "unlikely")
    assert.equal(result.ceilingDays, Math.ceil(7_512 / 88))
    assert.match(result.text, /942/)
  })

  it("Jayco Meta: $7,512 gap in 30 days → $655/day", () => {
    const result = backOnTrackPlan(JAYCO_META, 30)
    assert.equal(Math.round(result.dailyForPeriod), 655)
    assert.equal(result.feasibility, "unlikely")
    assert.match(result.text, /655/)
  })

  it("marks ≤2× yesterday as yes and ≤4× as stretch", () => {
    const easy = { ...JAYCO_META, yesterday: 1_000 }
    assert.equal(backOnTrackPlan(easy, 14).feasibility, "yes")
    const stretch = { ...JAYCO_META, yesterday: 300 }
    assert.equal(backOnTrackPlan(stretch, 14).feasibility, "stretch")
  })
})
