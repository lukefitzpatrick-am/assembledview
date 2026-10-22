import assert from "node:assert/strict"
import { test } from "node:test"

import { trimDirectLineToCountTo } from "../direct/trimDirectLineToCountTo"
import type { DirectDailyPoint, DirectLineItemRow } from "../direct/types"

function day(dateDay: string, reported: number, actual: number, deliverables = 0): DirectDailyPoint {
  return {
    dateDay,
    burstIndex: 0,
    reportedSpend: reported,
    actualPlatformSpend: actual,
    actualDeliverables: deliverables,
    expectedDailyDeliverables: 0,
    reportedCumulative: 0,
    actualCumulative: 0,
    expectedCumulative: 0,
    isSquareupDay: false,
    isLocked: false,
    buyType: "fixed_cost",
    capApplied: "",
  }
}

function line(daily: DirectDailyPoint[]): DirectLineItemRow {
  const reported = daily.reduce((s, d) => s + d.reportedSpend, 0)
  const actual = daily.reduce((s, d) => s + d.actualPlatformSpend, 0)
  const deliverables = daily.reduce((s, d) => s + d.actualDeliverables, 0)
  return {
    lineItemId: "p1test001tv1",
    mbaNumber: "P1TEST001",
    lineItemName: "TV",
    buyType: "fixed_cost",
    isCurrentlyFixedCost: true,
    wasEverFixedCost: true,
    totalBudget: 1000,
    totalReported: reported,
    totalActual: actual,
    variance: reported - actual,
    variancePct: reported > 0 ? (reported - actual) / reported : null,
    burstCount: 1,
    burstsDeliveredOver: 0,
    burstsDeliveredUnder: 0,
    lineItemStatus: "in_progress",
    bursts: [
      {
        burstIndex: 0,
        startDate: "2026-10-20",
        endDate: "2026-10-29",
        budget: 1000,
        expectedDeliverables: 100,
        actualDeliverables: deliverables,
        deliveryRatio: deliverables / 100,
        reportedSpend: reported,
        actualPlatformSpend: actual,
        variance: reported - actual,
        status: "in_progress",
      },
    ],
    daily,
  }
}

test("drops reported and actual after the count-to day from line and burst totals", () => {
  const input = line([
    day("2026-10-20", 100, 90, 10),
    day("2026-10-21", 100, 95, 10),
    day("2026-10-22", 100, 0, 5),
    day("2026-10-23", 0, 0),
  ])
  const out = trimDirectLineToCountTo(input, "2026-10-21")
  assert.equal(out.totalReported, 200)
  assert.equal(out.totalActual, 185)
  assert.equal(out.variance, 15)
  assert.equal(out.variancePct, 15 / 200)
  assert.equal(out.bursts[0]!.reportedSpend, 200)
  assert.equal(out.bursts[0]!.actualPlatformSpend, 185)
  assert.equal(out.bursts[0]!.variance, 15)
  assert.equal(out.bursts[0]!.actualDeliverables, 20)
  assert.equal(out.bursts[0]!.deliveryRatio, 0.2)
  // Daily series stays whole for charts.
  assert.equal(out.daily.length, 4)
})

test("a line with nothing after the count-to day is returned unchanged", () => {
  const input = line([day("2026-10-20", 100, 90), day("2026-10-23", 0, 0)])
  assert.equal(trimDirectLineToCountTo(input, "2026-10-21"), input)
})

test("keeps the mart total as the base when it differs from the daily sum", () => {
  const input = { ...line([day("2026-10-21", 100, 100), day("2026-10-22", 50, 0)]), totalReported: 400 }
  const out = trimDirectLineToCountTo(input, "2026-10-21")
  assert.equal(out.totalReported, 350)
})
