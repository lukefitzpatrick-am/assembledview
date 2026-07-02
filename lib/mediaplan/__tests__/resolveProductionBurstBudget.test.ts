import assert from "node:assert/strict"
import test from "node:test"

import {
  formatProductionBurstForPersist,
  resolveProductionBurstBudget,
} from "@/lib/mediaplan/resolveProductionBurstBudget"

/** Saved Xano `bursts_json` shape (cost × amount only, no standard keys). */
const SAVED_PRODUCTION_BURSTS_JSON = [
  {
    cost: 1500,
    amount: 2,
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    description: "Studio shoot",
    market: "NSW",
  },
  {
    cost: 850,
    amount: 5,
    startDate: "2026-04-01",
    endDate: "2026-04-30",
  },
] as const

test("resolveProductionBurstBudget derives effectiveBudget from cost × amount", () => {
  const burst = SAVED_PRODUCTION_BURSTS_JSON[0]
  assert.deepEqual(resolveProductionBurstBudget(burst), {
    effectiveBudget: 3000,
    deliverables: 2,
  })
})

test("resolveProductionBurstBudget handles real saved bursts_json fixture array", () => {
  for (const burst of SAVED_PRODUCTION_BURSTS_JSON) {
    const { effectiveBudget, deliverables } = resolveProductionBurstBudget(burst)
    const cost = burst.cost
    const amount = burst.amount
    assert.equal(effectiveBudget, cost * amount)
    assert.equal(deliverables, amount)
  }
})

test("resolveProductionBurstBudget prefers explicit budget (double-count guard)", () => {
  assert.deepEqual(
    resolveProductionBurstBudget({
      cost: 1500,
      amount: 2,
      budget: "5000",
      calculatedValue: 2,
    }),
    { effectiveBudget: 5000, deliverables: 2 }
  )
})

test("resolveProductionBurstBudget falls back to buyAmount for standard bursts", () => {
  assert.deepEqual(
    resolveProductionBurstBudget({
      budget: "",
      buyAmount: "11000",
      calculatedValue: 10000,
      startDate: "2026-01-01",
      endDate: "2026-01-07",
    }),
    { effectiveBudget: 11000, deliverables: 10000 }
  )
})

test("formatProductionBurstForPersist dual-writes standard keys alongside cost/amount", () => {
  const formatted = formatProductionBurstForPersist(SAVED_PRODUCTION_BURSTS_JSON[0])
  assert.deepEqual(formatted, {
    cost: 1500,
    amount: 2,
    budget: "3000",
    buyAmount: "2",
    calculatedValue: 2,
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    description: "Studio shoot",
    market: "NSW",
  })
})

test("dual-written burst is not double-counted by resolveProductionBurstBudget", () => {
  const dualWritten = formatProductionBurstForPersist(SAVED_PRODUCTION_BURSTS_JSON[1])
  assert.deepEqual(resolveProductionBurstBudget(dualWritten), {
    effectiveBudget: 4250,
    deliverables: 5,
  })
})
