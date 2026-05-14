import assert from "node:assert/strict"
import test from "node:test"
import {
  computeCampaignDays,
  computeDailyPace,
  computeDaysPassed,
  computeDaysRemaining,
  computeExpectedPct,
  computeExpectedSpend,
  computeProjectionVariancePct,
  computeProjectedTotal,
  computeRequiredDaily,
  computeSpendVariance,
  computeSpendVariancePct,
} from "../index.js"

function nearEqual(actual: number, expected: number, absTol: number) {
  assert.ok(
    Math.abs(actual - expected) <= absTol,
    `expected ${expected} ± ${absTol}, got ${actual}`,
  )
}

test("synthetic mid-flight: SQL-correct calendar (365 days, 182 passed, 183 remaining)", () => {
  const start = "2025-01-01"
  const end = "2025-12-31"
  const asOf = "2025-07-01"
  const budget = 100_000
  const spendToDate = 48_000

  const campaignDays = computeCampaignDays(start, end)
  const daysPassed = computeDaysPassed(start, end, asOf)
  const daysRemaining = computeDaysRemaining(start, end, asOf)

  assert.equal(campaignDays, 365)
  assert.equal(daysPassed, 182)
  assert.equal(daysRemaining, 183)

  const expectedPct = computeExpectedPct(daysPassed, campaignDays)
  const expectedSpend = computeExpectedSpend(budget, expectedPct)
  const spendVariance = computeSpendVariance(spendToDate, expectedSpend)
  const spendVariancePct = computeSpendVariancePct(spendVariance, expectedSpend)
  const dailyPace = computeDailyPace(spendToDate, daysPassed)
  const requiredDaily = computeRequiredDaily(budget, spendToDate, daysRemaining)
  const projectedTotal = computeProjectedTotal(dailyPace, campaignDays)
  const projectionVariancePct = computeProjectionVariancePct(projectedTotal, budget)

  nearEqual(expectedPct, 182 / 365, 1e-10)
  nearEqual(expectedSpend, 49_863.01369863014, 0.01)
  nearEqual(spendVariance, -1863.01369863014, 0.01)
  nearEqual(spendVariancePct, -0.03736263736263736, 1e-6)
  nearEqual(dailyPace, 263.73626373626376, 0.01)
  nearEqual(requiredDaily, 284.15300546448087, 0.01)
  nearEqual(projectedTotal, 96_263.73424623427, 0.01)
  nearEqual(projectionVariancePct, -0.03736265753765729, 1e-6)
})

test("zero budget mid-flight: spend-derived fields are zero where DIV0 applies", () => {
  const start = "2025-01-01"
  const end = "2025-01-31"
  const asOf = "2025-01-15"
  const budget = 0
  const spendToDate = 0
  const campaignDays = computeCampaignDays(start, end)
  const daysPassed = computeDaysPassed(start, end, asOf)
  const daysRemaining = computeDaysRemaining(start, end, asOf)

  const expectedPct = computeExpectedPct(daysPassed, campaignDays)
  const expectedSpend = computeExpectedSpend(budget, expectedPct)
  assert.equal(expectedSpend, 0)
  assert.equal(computeSpendVariance(spendToDate, expectedSpend), 0)
  assert.equal(computeSpendVariancePct(0, 0), 0)
  assert.equal(computeDailyPace(spendToDate, daysPassed), 0)
  assert.equal(computeRequiredDaily(budget, spendToDate, daysRemaining), 0)
  assert.equal(computeProjectedTotal(0, campaignDays), 0)
  assert.equal(computeProjectionVariancePct(0, 0), 0)
})

test("pre-start: expectedSpend and dailyPace zero; requiredDaily spreads full budget", () => {
  const start = "2026-06-01"
  const end = "2026-06-30"
  const asOf = "2026-05-15"
  const budget = 30_000
  const spendToDate = 0
  const campaignDays = computeCampaignDays(start, end)
  const daysPassed = computeDaysPassed(start, end, asOf)
  const daysRemaining = computeDaysRemaining(start, end, asOf)

  assert.equal(daysPassed, 0)
  assert.equal(computeExpectedSpend(budget, computeExpectedPct(daysPassed, campaignDays)), 0)
  assert.equal(computeDailyPace(spendToDate, daysPassed), 0)
  nearEqual(computeRequiredDaily(budget, spendToDate, daysRemaining), budget / campaignDays, 1e-10)
})

test("post-end: requiredDaily is zero (no days left to spend)", () => {
  const start = "2025-01-01"
  const end = "2025-12-31"
  const asOf = "2026-05-15"
  const budget = 100_000
  const spendToDate = 99_000
  assert.equal(computeDaysRemaining(start, end, asOf), 0)
  assert.equal(computeRequiredDaily(budget, spendToDate, 0), 0)
})
