import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import { planMbaFeeOverridePersistence } from "../planMbaFeeOverridePersistence.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

function twoMonthSearchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "S-fee",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    // Gross budget includes fees @ 20% → media 8_000, fee 2_000.
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    feePct: 20,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

/**
 * (i) Fee re-timed only, sum preserved → mbaScopeTotals.fee unchanged,
 * gate true, mbaFeeAdjusted false, no new version.
 */
test("fee override retimed only: sum preserved → mbaFeeAdjusted false, noop version plan", () => {
  // Calculated fee @ 20% on $10k media = $2,000, prorated Jun+Jul.
  const calculated = computeCampaignFinancials([twoMonthSearchLine()], { feeLoading: {} })
  assert.equal(calculated.mbaScopeTotals.fee, 2000)

  const line = twoMonthSearchLine({
    feeOverride: {
      mode: "manual",
      reason: "manual",
      // Full $2,000 moved into June — timing only.
      months: [
        { month: "2026-06", amount: 2000 },
        { month: "2026-07", amount: 0 },
      ],
      dateBasis: "2026-06-01|2026-07-31",
      component: "fee",
    },
  })

  const result = computeCampaignFinancials([line], { feeLoading: {} })

  assert.equal(result.mbaScopeTotals.fee, 2000)
  assert.equal(result.mbaScopeTotals.nettExGst, calculated.mbaScopeTotals.nettExGst)
  assert.equal(result.validation.billableEqualsMba, true)
  assert.equal(result.mbaFeeAdjusted, false)
  assert.equal(result.rebill_needed, false)
  assert.equal(result.perLine[0]!.flags.manualFee, true)

  const juneFee = result.billingSchedule.find((m) => m.monthYear === "June 2026")
  const julyFee = result.billingSchedule.find((m) => m.monthYear === "July 2026")
  assert.ok(juneFee)
  assert.ok(julyFee)
  // Fee fully in June.
  assert.match(juneFee!.feeTotal, /2,000/)
  assert.match(julyFee!.feeTotal, /\$0\.00|0\.00/)

  const plan = planMbaFeeOverridePersistence({
    priorStatus: "approved",
    financials: result,
    lineItems: [line],
  })
  assert.equal(plan.action, "noop")
  assert.equal(plan.rebill_needed, false)
})

/**
 * (ii) Fee reduced on one line of a DRAFT MBA → mbaScopeTotals.fee + nett lower,
 * billing matches, gate true, flags.manualFee, mbaFeeAdjusted, apply in place.
 */
test("fee override reduced on DRAFT MBA: mba fee follows, apply_inplace", () => {
  const baseline = computeCampaignFinancials([twoMonthSearchLine()], { feeLoading: {} })
  assert.equal(baseline.mbaScopeTotals.fee, 2000)

  const line = twoMonthSearchLine({
    feeOverride: {
      mode: "manual",
      reason: "client_terms",
      // Reduce fee by $500 → $1,500 total.
      months: [
        { month: "2026-06", amount: 750 },
        { month: "2026-07", amount: 750 },
      ],
      dateBasis: "2026-06-01|2026-07-31",
      component: "fee",
    },
  })

  const result = computeCampaignFinancials([line], { feeLoading: {} })
  const delta = 500

  assert.equal(result.mbaScopeTotals.fee, 1500)
  assert.equal(
    result.mbaScopeTotals.nettExGst,
    baseline.mbaScopeTotals.nettExGst - delta
  )
  assert.equal(result.perLine[0]!.fee, 1500)
  assert.equal(result.perLine[0]!.flags.manualFee, true)
  assert.equal(result.mbaFeeAdjusted, true)
  assert.equal(result.rebill_needed, true)
  assert.equal(
    result.validation.billableEqualsMba,
    true,
    `billing must match MBA after fee follow; delta=${result.validation.deltaExGst}`
  )

  // Billing feeTotal sum == MBA fee.
  const billingFeeSum = result.billingSchedule.reduce((s, m) => {
    const n = Number(String(m.feeTotal).replace(/[^0-9.-]/g, ""))
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)
  assert.equal(Math.round(billingFeeSum * 100) / 100, 1500)

  const plan = planMbaFeeOverridePersistence({
    priorStatus: "draft",
    financials: result,
    lineItems: [line],
  })
  assert.equal(plan.action, "apply_inplace")
  assert.equal(plan.rebill_needed, true)
  assert.equal(plan.mbaFeeAdjusted, true)
})

/**
 * (iii) Fee reduced on an APPROVED MBA → spawn pending-approval version carrying
 * the override; prior approved version untouched; rebill_needed true.
 */
test("fee override reduced on APPROVED MBA: spawn_version pending-approval", () => {
  const priorApprovedSnapshot = {
    status: "approved" as const,
    mbaFee: 2000,
    lineItems: [twoMonthSearchLine()],
  }

  const line = twoMonthSearchLine({
    feeOverride: {
      mode: "manual",
      reason: "manual",
      months: [{ month: "2026-06", amount: 1200 }],
      dateBasis: "2026-06-01|2026-07-31",
      component: "fee",
    },
  })

  const result = computeCampaignFinancials([line], { feeLoading: {} })
  assert.equal(result.mbaScopeTotals.fee, 1200)
  assert.equal(result.mbaFeeAdjusted, true)
  assert.equal(result.rebill_needed, true)
  assert.equal(result.validation.billableEqualsMba, true)
  assert.equal(result.perLine[0]!.flags.manualFee, true)

  const plan = planMbaFeeOverridePersistence({
    priorStatus: priorApprovedSnapshot.status,
    financials: result,
    lineItems: [line],
  })

  assert.equal(plan.action, "spawn_version")
  if (plan.action !== "spawn_version") throw new Error("expected spawn_version")
  assert.equal(plan.nextStatus, "pending-approval")
  assert.equal(plan.rebill_needed, true)
  assert.equal(plan.mbaFeeAdjusted, true)
  assert.ok(plan.lineItems[0]?.feeOverride)
  assert.equal(plan.lineItems[0]!.feeOverride!.months[0]!.amount, 1200)

  // Prior approved snapshot is not mutated by the planner.
  assert.equal(priorApprovedSnapshot.status, "approved")
  assert.equal(priorApprovedSnapshot.mbaFee, 2000)
  assert.equal(priorApprovedSnapshot.lineItems[0]!.feeOverride, undefined)
})
