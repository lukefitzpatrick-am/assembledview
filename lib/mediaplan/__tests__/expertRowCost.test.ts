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
    mergedWeekSpans: [{ totalQty: 3 }, { totalQty: NaN }],
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

test("expertRowNetMedia applies fee split", () => {
  const row = {
    buyType: "cpc",
    unitRate: 10,
    weeklyValues: { "2026-01-05": 50, "2026-01-12": 0 },
    budgetIncludesFees: true,
    clientPaysForMedia: false,
  }
  assert.equal(expertRowNetMedia(row, weekKeys, 15), 425)
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
  const split = expertRowCostSplit(row, weekKeys, 10)
  assert.equal(split.raw, 1000)
  assert.equal(split.net, 900)
  assert.equal(split.fee, 100)
})
