import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { validateAgencyFeeMonthTotalDrift } from "../validateAgencyFeeMonthTotalDrift.js"

const emptyMediaCosts = (): BillingMonth["mediaCosts"] => ({
  search: "$0.00",
  socialMedia: "$0.00",
  television: "$0.00",
  radio: "$0.00",
  newspaper: "$0.00",
  magazines: "$0.00",
  ooh: "$0.00",
  cinema: "$0.00",
  digiDisplay: "$0.00",
  digiAudio: "$0.00",
  digiVideo: "$0.00",
  bvod: "$0.00",
  integration: "$0.00",
  progDisplay: "$0.00",
  progVideo: "$0.00",
  progBvod: "$0.00",
  progAudio: "$0.00",
  progOoh: "$0.00",
  influencers: "$0.00",
  production: "$0.00",
})

function month(feeTotal: string): BillingMonth {
  return {
    monthYear: "May 2026",
    mediaTotal: "$0.00",
    feeTotal,
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: emptyMediaCosts(),
  }
}

test("sum exactly equals derived → withinTolerance true, diff 0", () => {
  const result = validateAgencyFeeMonthTotalDrift(
    [month("$6,740.00"), { ...month("$3,360.00"), monthYear: "June 2026" }],
    10100
  )
  assert.equal(result.withinTolerance, true)
  assert.equal(result.diff, 0)
})

test("sum $5 over derived → withinTolerance true (under $10)", () => {
  const result = validateAgencyFeeMonthTotalDrift([month("$10,105.00")], 10100)
  assert.equal(result.withinTolerance, true)
  assert.equal(result.diff, 5)
})

test("sum $10 over derived → withinTolerance false (at threshold)", () => {
  const result = validateAgencyFeeMonthTotalDrift([month("$10,110.00")], 10100)
  assert.equal(result.withinTolerance, false)
  assert.equal(result.diff, 10)
})

test("sum $50 under derived → withinTolerance false, diff -50", () => {
  const result = validateAgencyFeeMonthTotalDrift([month("$10,050.00")], 10100)
  assert.equal(result.withinTolerance, false)
  assert.equal(result.diff, -50)
})

test("custom tolerance respected", () => {
  const result = validateAgencyFeeMonthTotalDrift([month("$10,105.00")], 10100, {
    tolerance: 5,
  })
  assert.equal(result.withinTolerance, false)
  assert.equal(result.toleranceUsed, 5)
})

test("empty months → sum 0, diff = -derived", () => {
  const result = validateAgencyFeeMonthTotalDrift([], 10100)
  assert.equal(result.sumOfMonthFeeTotals, 0)
  assert.equal(result.diff, -10100)
  assert.equal(result.withinTolerance, false)
})
