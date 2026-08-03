import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { monthsForMbaBillingGates } from "@/lib/finance/resolveMbaBillingModalState.js"
import { validateAgencyFeeMonthTotalDrift } from "@/lib/billing/validateAgencyFeeMonthTotalDrift.js"

const emptyMediaCosts = (): BillingMonth["mediaCosts"] => ({
  search: "$0.00",
  socialMedia: "$0.00",
  television: "$0.00",
  radio: "$0.00",
  newspaper: "$0.00",
  magazines: "$0.00",
  ooh: "$0.00",
  cinema: "$0.00",
  digiDisplay: "$0.00",
  digiAudio: "$0.00",
  digiVideo: "$0.00",
  bvod: "$0.00",
  integration: "$0.00",
  progDisplay: "$0.00",
  progVideo: "$0.00",
  progBvod: "$0.00",
  progAudio: "$0.00",
  progOoh: "$0.00",
  influencers: "$0.00",
  production: "$0.00",
})

function month(feeTotal: string): BillingMonth {
  return {
    monthYear: "August 2026",
    mediaTotal: "$0.00",
    feeTotal,
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: feeTotal,
    mediaCosts: emptyMediaCosts(),
  }
}

describe("MB-10 monthsForMbaBillingGates", () => {
  it("display fee sum equals the figure the gate blocked on when resolved and raw diverge", () => {
    const rawDraft = [month("$0.00")]
    const resolved = [month("$5,000.00")]
    const derivedCampaignFee = 5000

    const monthsForGates = monthsForMbaBillingGates(
      { viewReady: true, resolvedMonths: resolved },
      rawDraft
    )
    const gate = validateAgencyFeeMonthTotalDrift(monthsForGates, derivedCampaignFee)
    // Display must use the same months selection as the gate — never raw alone.
    const displayedSum = gate.sumOfMonthFeeTotals

    assert.equal(monthsForGates, resolved)
    assert.equal(displayedSum, 5000)
    assert.equal(gate.withinTolerance, true)
    assert.notEqual(
      validateAgencyFeeMonthTotalDrift(rawDraft, derivedCampaignFee).sumOfMonthFeeTotals,
      displayedSum,
      "raw draft alone still shows $0 — the bug shape"
    )
  })

  it("returns [] when view is not ready (stranded draft)", () => {
    const rawDraft = [month("$5,000.00")]
    const months = monthsForMbaBillingGates(
      { viewReady: false, resolvedMonths: [] },
      rawDraft
    )
    assert.deepEqual(months, [])
    const gate = validateAgencyFeeMonthTotalDrift(months, 5000)
    assert.equal(gate.withinTolerance, true)
    assert.equal(gate.sumOfMonthFeeTotals, 0)
  })

  it("falls back to draft when viewReady but resolved months empty", () => {
    const rawDraft = [month("$1,234.00")]
    const months = monthsForMbaBillingGates(
      { viewReady: true, resolvedMonths: [] },
      rawDraft
    )
    assert.equal(months, rawDraft)
    assert.equal(
      validateAgencyFeeMonthTotalDrift(months, 1234).sumOfMonthFeeTotals,
      1234
    )
  })
})
