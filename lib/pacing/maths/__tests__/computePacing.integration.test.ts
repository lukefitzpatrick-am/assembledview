import assert from "node:assert/strict"
import test from "node:test"
import { computePacing, type PacingMathsInput } from "../index.js"

function nearEqual(actual: number, expected: number, absTol: number) {
  assert.ok(
    Math.abs(actual - expected) <= absTol,
    `expected ${expected} ± ${absTol}, got ${actual}`,
  )
}

test("computePacing: curatif002se1 Stage 1b metrics (budget stub; KPIs from Snowflake)", () => {
  const input: PacingMathsInput = {
    lineItemBudget: 200_000,
    startDate: "2025-04-01",
    endDate: "2026-05-12",
    spendToDate: 66917.67,
    spendYesterday: 51.76,
    impressionsToDate: 2_760_685,
    clicksToDate: 35_157,
    conversionsToDate: 1366.31,
    revenueToDate: 273_650.35,
    asOfDate: "2026-05-12",
  }

  const output = computePacing(input)

  assert.equal(output.asOfDate, "2026-05-12")
  assert.equal(output.campaignDays, 407)
  assert.equal(output.daysPassed, 407)
  assert.equal(output.daysRemaining, 0)

  nearEqual(output.ctr, 35157 / 2760685, 1e-6)
  nearEqual(output.cpc, 66917.67 / 35157, 1e-4)
  nearEqual(output.cpa, 66917.67 / 1366.31, 1e-4)
  nearEqual(output.cr, 1366.31 / 35157, 1e-6)
  // C5: search revenue is all conversion value, so ROAS is not tracked here.
  assert.equal(output.roas, null)

  assert.notEqual(output.status, "unknown")
  assert.equal(output.status, "under_pacing")

  for (const k of [
    "expectedPct",
    "expectedSpend",
    "spendVariance",
    "spendVariancePct",
    "dailyPace",
    "requiredDaily",
    "projectedTotal",
    "projectionVariancePct",
    "ctr",
    "cpc",
    "cpa",
    "cr",
  ] as const) {
    assert.ok(Number.isFinite(output[k]), `${k} should be finite`)
  }
})
