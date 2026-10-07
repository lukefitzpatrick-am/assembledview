import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeAdServingCost } from "../computeAdServingCost.js"
import { computeBillingAndDeliveryMonths } from "../computeSchedule.js"
import type { BillingBurst } from "../types.js"

function money(value: string): number {
  const n = Number(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function burst(deliverables: number, start: string, end: string): BillingBurst {
  return {
    startDate: new Date(start),
    endDate: new Date(end),
    mediaAmount: 100,
    feeAmount: 20,
    totalAmount: 120,
    mediaType: "digiDisplay",
    noAdserving: false,
    feePercentage: 0,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    deliverables,
    buyType: "cpm",
  }
}

describe("ad serving rounds per month", () => {
  it("three half-cent lines: months sum to each line and to the month parts", () => {
    const rate = 2.5
    const lines = [
      burst(4004, "2026-01-01", "2026-02-28"),
      burst(4006, "2026-01-01", "2026-02-28"),
      burst(4010, "2026-01-15", "2026-02-14"),
    ]
    const { billingMonths } = computeBillingAndDeliveryMonths({
      campaignStart: new Date("2026-01-01"),
      campaignEnd: new Date("2026-02-28"),
      burstsByMediaType: { digiDisplay: lines },
      getRateForMediaType: () => rate,
      adservaudio: 0,
      isManualBilling: false,
    })

    const adServingShown = billingMonths.reduce((sum, month) => sum + money(month.adservingTechFees), 0)
    const lineTotal = lines.reduce(
      (sum, line) =>
        sum +
        computeAdServingCost({
          quantity: line.deliverables,
          buyType: "cpm",
          mediaType: "digiDisplay",
          rate,
        }),
      0,
    )
    assert.equal(Math.round(adServingShown * 100), Math.round(lineTotal * 100))

    for (const month of billingMonths) {
      const parts =
        money(month.mediaTotal) +
        money(month.feeTotal) +
        money(month.adservingTechFees) +
        money(month.production)
      assert.equal(Math.round(parts * 100), Math.round(money(month.totalAmount) * 100))
    }
  })
})
