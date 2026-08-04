import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createAdServingRateResolver,
  resolveAdServingRateForMediaType,
} from "../adServingRateResolver.js"
import { computeBillingAndDeliveryMonths } from "../computeSchedule.js"
import type { BillingBurst } from "../types.js"

function parseAdServing(months: { adservingTechFees: string }[]): number {
  return months.reduce((sum, m) => {
    const n = Number(String(m.adservingTechFees).replace(/[^0-9.-]/g, ""))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

function digiDisplayCpmBurst(deliverables: number): BillingBurst {
  return {
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-31"),
    mediaAmount: 1000,
    feeAmount: 0,
    totalAmount: 1000,
    mediaType: "digiDisplay",
    noAdserving: false,
    feePercentage: 0,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    deliverables,
    buyType: "cpm",
  }
}

describe("adServingRateResolver", () => {
  it("maps spaced/capitalised variants to the correct rate bucket", () => {
    const rates = { video: 1.1, audio: 2.2, display: 3.3, imp: 4.4 }
    assert.equal(resolveAdServingRateForMediaType("Digi Video", rates), 1.1)
    assert.equal(resolveAdServingRateForMediaType("digi audio", rates), 2.2)
    assert.equal(resolveAdServingRateForMediaType("digi display", rates), 3.3)
    assert.equal(resolveAdServingRateForMediaType("Prog BVOD", rates), 1.1)
    assert.equal(resolveAdServingRateForMediaType("unknown-channel", rates), 4.4)
  })
})

describe("computeBillingAndDeliveryMonths ad-serving trap", () => {
  const campaignStart = new Date("2026-01-01")
  const campaignEnd = new Date("2026-01-31")
  const burstsByMediaType = {
    digiDisplay: [digiDisplayCpmBurst(100_000)],
  }

  it("non-zero adservdisplay yields non-zero adServing", () => {
    const getRateForMediaType = createAdServingRateResolver({
      video: 0,
      audio: 0,
      display: 2.5,
      imp: 0,
    })
    const { billingMonths } = computeBillingAndDeliveryMonths({
      campaignStart,
      campaignEnd,
      burstsByMediaType,
      getRateForMediaType,
      adservaudio: 0,
      isManualBilling: false,
    })
    // 100_000 impressions / 1000 * $2.50 = $250
    assert.equal(parseAdServing(billingMonths), 250)
  })

  it("resolver absent (() => 0) yields $0 — documents the save-path trap", () => {
    const { billingMonths } = computeBillingAndDeliveryMonths({
      campaignStart,
      campaignEnd,
      burstsByMediaType,
      getRateForMediaType: () => 0,
      adservaudio: 0,
      isManualBilling: false,
    })
    assert.equal(parseAdServing(billingMonths), 0)
  })
})
