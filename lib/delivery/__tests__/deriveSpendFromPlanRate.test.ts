import assert from "node:assert/strict"
import test from "node:test"

import { deriveSpendFromPlanRate } from "../deriveSpendFromPlanRate"

test("zero deliverables yields all-zero spend and does not divide by zero", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "sinch001PD1",
    buyType: "cpm",
    bursts: [{ mediaAmount: 7000, calculatedValue: 0, buyAmount: "7.00" }],
    days: [
      { date: "2026-03-02", impressions: 1000, clicks: 0, results: 0 },
      { date: "2026-03-01", impressions: 2000, clicks: 0, results: 0 },
    ],
  })
  assert.equal(result.effectiveRate, 0)
  assert.deepEqual(
    result.days.map((d) => d.derivedSpend),
    [0, 0],
  )
  assert.equal(result.capReached, false)
  assert.equal(result.capReachedOn, null)
})

test("exact cap landing uses the last day's remainder and flags that date", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "sinch001PD1",
    buyType: "cpm",
    bursts: [{ mediaAmount: 14, calculatedValue: 2000, buyAmount: "7.00" }],
    days: [
      { date: "2026-03-01", impressions: 1000, clicks: 0, results: 0 },
      { date: "2026-03-02", impressions: 1000, clicks: 0, results: 0 },
    ],
  })
  assert.equal(result.effectiveRate, 0.007)
  assert.equal(result.days[0]?.derivedSpend, 7)
  assert.equal(result.days[1]?.derivedSpend, 7)
  assert.equal(result.capReached, true)
  assert.equal(result.capReachedOn, "2026-03-02")
})

test("cap mid-day clips the partial day and zeros every later day", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "sinch001PD1",
    buyType: "cpm",
    bursts: [{ mediaAmount: 10, calculatedValue: 1000, buyAmount: "10.00" }],
    days: [
      { date: "2026-03-01", impressions: 800, clicks: 0, results: 0 },
      { date: "2026-03-02", impressions: 800, clicks: 0, results: 0 },
      { date: "2026-03-03", impressions: 800, clicks: 0, results: 0 },
    ],
  })
  assert.equal(result.effectiveRate, 0.01)
  assert.equal(result.days[0]?.derivedSpend, 8)
  assert.equal(result.days[1]?.derivedSpend, 2)
  assert.equal(result.days[2]?.derivedSpend, 0)
  assert.equal(result.capReached, true)
  assert.equal(result.capReachedOn, "2026-03-02")
})

test("no plan total yields all-zero spend", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "empty",
    buyType: "cpm",
    bursts: [{ calculatedValue: 1000 }],
    days: [{ date: "2026-03-01", impressions: 500, clicks: 0, results: 0 }],
  })
  assert.equal(result.effectiveRate, 0)
  assert.equal(result.plannedTotal, 0)
  assert.equal(result.days[0]?.derivedSpend, 0)
})

test("shuffled day order is sorted ascending and matches chronological result", () => {
  const bursts = [{ mediaAmount: 14, calculatedValue: 2000, buyAmount: "7.00" }]
  const chronological = deriveSpendFromPlanRate({
    lineItemId: "sinch001PD1",
    buyType: "cpm",
    bursts,
    days: [
      { date: "2026-03-01", impressions: 1000, clicks: 0, results: 0 },
      { date: "2026-03-02", impressions: 1000, clicks: 0, results: 0 },
    ],
  })
  const shuffled = deriveSpendFromPlanRate({
    lineItemId: "sinch001PD1",
    buyType: "cpm",
    bursts,
    days: [
      { date: "2026-03-02", impressions: 1000, clicks: 0, results: 0 },
      { date: "2026-03-01", impressions: 1000, clicks: 0, results: 0 },
    ],
  })
  assert.deepEqual(
    shuffled.days.map((d) => d.date),
    ["2026-03-01", "2026-03-02"],
  )
  assert.deepEqual(shuffled.days, chronological.days)
})

test("cpm assertion: live expected rates match buyAmount within one cent", () => {
  const cases = [
    { id: "sinch001PD1", media: 7, imps: 1000, buyAmount: "7.00", rate: 0.007 },
    { id: "sinch001PV1", media: 55, imps: 1000, buyAmount: "55.00", rate: 0.055 },
    { id: "bowel001DD2", media: 50, imps: 1000, buyAmount: "50.00", rate: 0.05 },
  ]
  for (const row of cases) {
    const result = deriveSpendFromPlanRate({
      lineItemId: row.id,
      buyType: "cpm",
      bursts: [{ mediaAmount: row.media, calculatedValue: row.imps, buyAmount: row.buyAmount }],
      days: [{ date: "2026-03-01", impressions: row.imps, clicks: 0, results: 0 }],
    })
    assert.equal(result.effectiveRate, row.rate, row.id)
    assert.equal(result.cpmAssertion?.ok, true, row.id)
    const derivedCpm = result.effectiveRate * 1000
    assert.ok(Math.abs(derivedCpm - Number(row.buyAmount)) <= 0.01, row.id)
  }
})

test("missing mediaAmount falls back to budget and reports the line", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "legacyPD1",
    buyType: "cpm",
    bursts: [{ budget: 7, calculated_value_number: 1000, buyAmount: "7.00" }],
    days: [{ date: "2026-03-01", impressions: 1000, clicks: 0, results: 0 }],
  })
  assert.equal(result.effectiveRate, 0.007)
  assert.equal(result.usedBudgetFallback, true)
  assert.ok(result.warnings.some((w) => /legacyPD1/.test(w) && /budget/.test(w)))
})

test("unknown buy_type uses impressions and reports it", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "oddPD1",
    buyType: "fixed_cost",
    bursts: [{ mediaAmount: 10, calculatedValue: 1000 }],
    days: [{ date: "2026-03-01", impressions: 100, clicks: 50, results: 9 }],
  })
  assert.equal(result.unitsField, "impressions")
  assert.equal(result.buyTypeFallbackToImpressions, true)
  assert.equal(result.days[0]?.derivedSpend, 1)
  assert.ok(result.warnings.some((w) => /fixed_cost/.test(w)))
})

test("cpc uses clicks; cpv uses results", () => {
  const cpc = deriveSpendFromPlanRate({
    lineItemId: "cpc1",
    buyType: "cpc",
    bursts: [{ mediaAmount: 10, calculatedValue: 100 }],
    days: [{ date: "2026-03-01", impressions: 1000, clicks: 20, results: 5 }],
  })
  assert.equal(cpc.unitsField, "clicks")
  assert.equal(cpc.days[0]?.derivedSpend, 2)

  const cpv = deriveSpendFromPlanRate({
    lineItemId: "cpv1",
    buyType: "cpv",
    bursts: [{ mediaAmount: 10, calculatedValue: 100 }],
    days: [{ date: "2026-03-01", impressions: 1000, clicks: 20, results: 5 }],
  })
  assert.equal(cpv.unitsField, "results")
  assert.equal(cpv.days[0]?.derivedSpend, 0.5)
})

test("cpm mismatch is reported and still uses the derived rate, never buyAmount", () => {
  const result = deriveSpendFromPlanRate({
    lineItemId: "mismatchPD1",
    buyType: "cpm",
    bursts: [{ mediaAmount: 7, calculatedValue: 1000, buyAmount: "9.00" }],
    days: [{ date: "2026-03-01", impressions: 1000, clicks: 0, results: 0 }],
  })
  assert.equal(result.effectiveRate, 0.007)
  assert.equal(result.days[0]?.derivedSpend, 7)
  assert.equal(result.cpmAssertion?.ok, false)
  assert.ok(result.warnings.some((w) => /mismatchPD1/.test(w) && /buyAmount/.test(w)))
})
