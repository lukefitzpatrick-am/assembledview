import assert from "node:assert/strict"
import test from "node:test"

import { computePacing, pacingRoasLabel, PACING_ROAS_NOT_TRACKED, type PacingMathsInput } from "../index.js"

const BASE: PacingMathsInput = {
  lineItemBudget: 10_000,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  spendToDate: 2_000,
  spendYesterday: 100,
  impressionsToDate: 100_000,
  clicksToDate: 1_000,
  conversionsToDate: 40,
  revenueToDate: 30_000,
  asOfDate: "2026-10-21",
}

test("ROAS is not tracked from all search conversion value (C5)", () => {
  const out = computePacing(BASE)
  assert.equal(out.roas, null)
  assert.equal(pacingRoasLabel(out.roas), PACING_ROAS_NOT_TRACKED)
})

test("ROAS uses purchase revenue only when the surface has it", () => {
  const out = computePacing({ ...BASE, purchaseRevenueToDate: 8_500 })
  assert.equal(out.roas, 4.25)
  assert.equal(pacingRoasLabel(out.roas), "4.25x")
})

test("purchase revenue with no spend is not tracked", () => {
  const out = computePacing({ ...BASE, spendToDate: 0, purchaseRevenueToDate: 500 })
  assert.equal(out.roas, null)
  assert.equal(computePacing({ ...BASE, purchaseRevenueToDate: null }).roas, null)
})
