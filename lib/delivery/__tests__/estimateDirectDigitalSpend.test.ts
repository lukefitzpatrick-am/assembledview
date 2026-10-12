import assert from "node:assert/strict"
import test from "node:test"

import { combineDeliveredTotals } from "../deliveredTotals"
import {
  ESTIMATED_SPEND_LABEL,
  estimateDirectDigitalSpend,
  NO_PLANNED_IMPRESSIONS,
} from "../estimateDirectDigitalSpend"

const CPM_BURSTS = [{ budget: 10_000, calculatedValue: 500_000 }]

test("CPM: 100,000 impressions at $10,000 planned for 500,000 impressions is $2,000 estimated", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dd1",
    buyType: "cpm",
    bursts: CPM_BURSTS,
    days: [{ date: "2026-09-01", impressions: 100_000, clicks: 0, results: 0 }],
  })
  assert.equal(result.amount, 2_000)
  assert.equal(result.spendMode, "estimated")
  assert.equal(result.reason, null)
  assert.equal(ESTIMATED_SPEND_LABEL, "Estimated spend")
})

test("estimated spend is capped at planned media", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dd1",
    buyType: "cpm",
    bursts: CPM_BURSTS,
    days: [{ date: "2026-09-01", impressions: 600_000, clicks: 0, results: 0 }],
  })
  assert.equal(result.amount, 10_000)
  assert.equal(result.spendMode, "estimated")
})

test("a fixed-cost line is not estimated", () => {
  const flagged = estimateDirectDigitalSpend({
    lineItemId: "bicau002bv2",
    buyType: "cpm",
    fixedCost: true,
    bursts: CPM_BURSTS,
    days: [{ date: "2026-09-01", impressions: 100_000 }],
  })
  assert.equal(flagged.amount, null)
  assert.equal(flagged.spendMode, null)
  assert.equal(flagged.reason, null)

  const buyType = estimateDirectDigitalSpend({
    lineItemId: "bicau002dv1",
    buyType: "fixed_cost",
    bursts: [{ budget: 8_600, calculatedValue: 174_000 }],
    days: [{ date: "2026-09-01", impressions: 50_000 }],
  })
  assert.equal(buyType.amount, null)
  assert.equal(buyType.reason, null)
})

test("planned deliverables 0 gives no estimate and says why", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dd2",
    buyType: "cpm",
    bursts: [{ budget: 6_500, calculatedValue: 0 }],
    days: [{ date: "2026-09-01", impressions: 50_000 }],
  })
  assert.equal(result.amount, null)
  assert.equal(result.spendMode, null)
  assert.equal(result.reason, NO_PLANNED_IMPRESSIONS)
  assert.equal(result.reason, "No planned impressions")
})

test("CPV prices video views, not platform results", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dv1",
    buyType: "cpv",
    bursts: [{ budget: 1_000, calculatedValue: 10_000 }],
    days: [
      {
        date: "2026-09-01",
        impressions: 500_000,
        results: 999_999,
        video3sViews: 2_000,
      },
    ],
  })
  assert.equal(result.amount, 200)
})

test("hub Delivered total includes the estimated spend and keeps the flag", () => {
  const estimate = estimateDirectDigitalSpend({
    lineItemId: "golf025dd1",
    buyType: "cpm",
    bursts: CPM_BURSTS,
    days: [{ date: "2026-09-01", impressions: 100_000 }],
  })
  const totals = combineDeliveredTotals(
    {
      spendToDate: estimate.amount ?? 0,
      impressions: 100_000,
      includesEstimatedSpend: estimate.spendMode === "estimated",
    },
    0,
  )
  assert.equal(totals.spendToDate, 2_000)
  assert.equal(totals.includesEstimatedSpend, true)
})

test("$10,000 gross at 15% fee, 100,000 of 500,000 impressions, is the net rate times delivery", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dd1",
    buyType: "cpm",
    budgetIncludesFees: true,
    feePct: 15,
    versionId: 42,
    bursts: CPM_BURSTS,
    days: [{ date: "2026-09-01", impressions: 100_000, clicks: 0, results: 0 }],
  })
  assert.equal(result.amount, 1_700)
  assert.equal(result.plannedMedia, 8_500)
  assert.equal(result.spendMode, "estimated")
})

test("a burst that already has mediaAmount is not converted", () => {
  const result = estimateDirectDigitalSpend({
    lineItemId: "golf025dd1",
    buyType: "cpm",
    budgetIncludesFees: true,
    feePct: 15,
    versionId: 42,
    bursts: [{ budget: 10_000, mediaAmount: 10_000, calculatedValue: 500_000 }],
    days: [{ date: "2026-09-01", impressions: 100_000 }],
  })
  assert.equal(result.amount, 2_000)
})

test("no fee snapshot keeps the gross budget and logs the version", () => {
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    const result = estimateDirectDigitalSpend({
      lineItemId: "golf025dd1",
      buyType: "cpm",
      budgetIncludesFees: true,
      feePct: null,
      versionId: 42,
      bursts: CPM_BURSTS,
      days: [{ date: "2026-09-01", impressions: 100_000 }],
    })
    assert.equal(result.amount, 2_000)
    assert.equal(result.plannedMedia, 10_000)
    assert.ok(
      warnings.some(
        (args) =>
          args[0] === "[direct-digital-estimate] no fee snapshot for version 42; using gross",
      ),
    )
  } finally {
    console.warn = original
  }
})

test("budget_includes_fees false keeps the gross budget", () => {
  const warnings: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    const result = estimateDirectDigitalSpend({
      lineItemId: "golf025dd1",
      buyType: "cpm",
      budgetIncludesFees: false,
      feePct: 15,
      versionId: 42,
      bursts: CPM_BURSTS,
      days: [{ date: "2026-09-01", impressions: 100_000 }],
    })
    assert.equal(result.amount, 2_000)
    assert.equal(warnings.length, 0)
  } finally {
    console.warn = original
  }
})
