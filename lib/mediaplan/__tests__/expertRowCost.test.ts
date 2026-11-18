import assert from "node:assert/strict"
import test from "node:test"

import {
  expertRowCostSplit,
  expertRowGrossCost,
  expertRowNetMedia,
  expertRowNetMediaTooltip,
  expertRowQuantitySum,
} from "../expertRowCost.js"

const weekKeys = ["2026-01-05", "2026-01-12"] as const

test("expertRowQuantitySum sums weekly values and merged spans", () => {
  const row = {
    weeklyValues: { "2026-01-05": 10, "2026-01-12": 5 },
    mergedWeekSpans: [
      { startWeekKey: "2026-01-05", endWeekKey: "2026-01-12", totalQty: 3 },
      { startWeekKey: "2026-01-05", endWeekKey: "2026-01-12", totalQty: NaN },
    ],
  }
  assert.equal(expertRowQuantitySum(row, weekKeys), 18)
})

test("expertRowGrossCost: cpm uses (qty/1000)×rate", () => {
  const row = {
    buyType: "cpm",
    unitRate: 20,
    weeklyValues: { "2026-01-05": 5000, "2026-01-12": 0 },
  }
  assert.equal(expertRowGrossCost(row, weekKeys), 100)
})

test("expertRowGrossCost: linear buy type uses qty×rate", () => {
  const row = {
    buyType: "cpc",
    unitRate: 2.5,
    weeklyValues: { "2026-01-05": 100, "2026-01-12": 0 },
  }
  assert.equal(expertRowGrossCost(row, weekKeys), 250)
})

test("expertRowGrossCost: bonus returns 0", () => {
  const row = {
    buyType: "bonus",
    unitRate: 99,
    weeklyValues: { "2026-01-05": 1000, "2026-01-12": 0 },
  }
  assert.equal(expertRowGrossCost(row, weekKeys), 0)
})

test("expertRowNetMedia: a fee-inclusive line's cells are deliverables, so qty × rate is the net (V66 B)", () => {
  const row = {
    buyType: "cpc",
    unitRate: 10,
    weeklyValues: { "2026-01-05": 50, "2026-01-12": 0 },
    budgetIncludesFees: true,
    clientPaysForMedia: false,
  }
  assert.ok(Math.abs(expertRowNetMedia(row, weekKeys, 15) - 500) < 1e-9)
  assert.equal(expertRowNetMedia({ ...row, budgetIncludesFees: false }, weekKeys, 15), 500)
})

test("expertRowNetMediaTooltip strings", () => {
  const base = { unitRate: 12, weeklyValues: {} }
  assert.equal(
    expertRowNetMediaTooltip({ ...base, buyType: "bonus" }, 100),
    "Bonus: net media = 0"
  )
  assert.equal(
    expertRowNetMediaTooltip({ ...base, buyType: "cpm" }, 2000),
    "CPM: (Σ qty / 1000) × rate (2000 / 1000 × 12)"
  )
  assert.equal(
    expertRowNetMediaTooltip({ ...base, buyType: "cpc" }, 50),
    "Σ qty × rate (50 × 12)"
  )
})

test("expertRowCostSplit returns raw, net, and fee", () => {
  const row = {
    buyType: "cpc",
    unitRate: 10,
    weeklyValues: { "2026-01-05": 100, "2026-01-12": 0 },
    budgetIncludesFees: true,
    clientPaysForMedia: false,
  }
  // Fee-inclusive: 100 clicks x $10 is the $1,000 net; the budget is $1,111.11, the fee its 10%.
  const split = expertRowCostSplit(row, weekKeys, 10)
  assert.ok(Math.abs(split.raw - 1000 / 0.9) < 1e-9)
  assert.ok(Math.abs(split.net - 1000) < 1e-9)
  assert.ok(Math.abs(split.fee - 1000 / 9) < 1e-9)
  // Fee on top: the $1,000 is the budget and the net; the fee sits on top.
  const onTop = expertRowCostSplit({ ...row, budgetIncludesFees: false }, weekKeys, 10)
  assert.equal(onTop.raw, 1000)
  assert.equal(onTop.net, 1000)
  assert.ok(Math.abs(onTop.fee - 1000 / 9) < 1e-9)
})
