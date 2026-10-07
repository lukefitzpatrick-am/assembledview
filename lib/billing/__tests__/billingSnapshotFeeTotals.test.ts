import assert from "node:assert/strict"
import test from "node:test"

import { billingSnapshotFeeTotals } from "../billingSnapshotFeeTotals.js"

const MONTHS = [{ monthYear: "January 2026" }]

test("gross-in, net-in, client-pays and bonus share one fee total", () => {
  const fees = billingSnapshotFeeTotals(
    [
      {
        feePercentage: 20,
        budgetIncludesFees: true,
        bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: "12500" }],
      },
      {
        feePercentage: 20,
        bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: "10000" }],
      },
      {
        feePercentage: 20,
        clientPaysForMedia: true,
        bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: "10000" }],
      },
      {
        feePercentage: 20,
        buyType: "bonus",
        bursts: [{ startDate: "2026-01-01", endDate: "2026-01-31", budget: "10000" }],
      },
    ],
    "search",
    MONTHS,
  )
  assert.deepEqual(fees, [2500, 2500, 2500, 0])
})
