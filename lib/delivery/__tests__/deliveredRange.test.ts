import assert from "node:assert/strict"
import test from "node:test"

import {
  asOfForDeliveredRange,
  deliveredQueryWindow,
  sumDirectReportedSpendInRange,
} from "../deliveredTotals"

const group = {
  totalReported: 100,
  lineItems: [
    {
      daily: [
        { dateDay: "2026-01-05", reportedSpend: 40 },
        { dateDay: "2026-02-05", reportedSpend: 60 },
      ],
    },
  ],
}

test("getDeliveredTotalsForCampaign with no range equals the unbounded call", () => {
  assert.equal(deliveredQueryWindow(undefined, undefined), null)
  assert.equal(deliveredQueryWindow(null, null), null)
  assert.equal(sumDirectReportedSpendInRange(group), 100)
  assert.equal(sumDirectReportedSpendInRange(group, null, null), 100)
  assert.equal(asOfForDeliveredRange("2026-06-01"), "2026-06-01")
})

test("ranged delivered spend bounds DATE_DAY and clamps asOf to range end", () => {
  assert.deepEqual(deliveredQueryWindow("2026-01-01", "2026-01-31"), {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  })
  assert.equal(sumDirectReportedSpendInRange(group, "2026-01-01", "2026-01-31"), 40)
  assert.equal(asOfForDeliveredRange("2026-06-01", "2026-03-31"), "2026-03-31")
  assert.equal(asOfForDeliveredRange("2026-06-01", "2026-12-31"), "2026-06-01")
})

test("delivered from/to bounding requires both valid ISO dates (route contract)", () => {
  assert.equal(deliveredQueryWindow("2026-01-01", null), null)
  assert.equal(deliveredQueryWindow("2026-01-01", "13/01/2026"), null)
  assert.deepEqual(deliveredQueryWindow("2026-01-31", "2026-01-01"), {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  })
  assert.equal(sumDirectReportedSpendInRange(group, "2026-01-01", "2026-01-31"), 40)
  assert.equal(sumDirectReportedSpendInRange({ totalReported: 100, lineItems: [{ daily: [] }] }, "2026-01-01", "2026-01-31"), 0)
})
