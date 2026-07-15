import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

/**
 * Two-month delivery line with ISO (`YYYY-MM`) override months from billing_overrides.
 * Prepayment shifts the full line media into June while delivery stays June+July.
 */
test("manual prepayment override: ISO months match schedule monthYear (no phantoms)", () => {
  const line: LineItemInput = {
    lineItemId: "S-prepay",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      // Mimic billing_overrides table keys (ISO), not schedule monthYear labels.
      months: [
        { month: "2026-06", amount: 10_000 },
        { month: "2026-07", amount: 0 },
      ],
      dateBasis: "2026-06-01|2026-07-31",
    },
  }

  const result = computeCampaignFinancials([line], { feeLoading: {} })

  const scheduleLabels = result.billingSchedule.map((m) => m.monthYear)
  assert.deepEqual(
    scheduleLabels,
    ["June 2026", "July 2026"],
    `billingSchedule must only use monthYear labels; got ${JSON.stringify(scheduleLabels)}`
  )
  assert.ok(
    !scheduleLabels.some((label) => /^\d{4}-\d{2}$/.test(label)),
    "no ISO YYYY-MM phantom sparse rows"
  )

  const pl = result.perLine[0]!
  for (const m of pl.billingMonths) {
    assert.match(
      m.month,
      /^[A-Z][a-z]+ \d{4}$/,
      `billingMonths key must be monthYear, got ${m.month}`
    )
    assert.doesNotMatch(m.month, /^\d{4}-\d{2}$/)
  }
  const juneBill = pl.billingMonths.find((m) => m.month === "June 2026")
  assert.ok(juneBill, "per-line billingMonths must include June 2026")
  assert.equal(juneBill!.amount, 10_000)

  const julyDelta = result.deliveryVsBillingDelta.find((d) => d.month === "July 2026")
  assert.ok(julyDelta, "expected a deliveryVsBillingDelta row for July 2026")
  assert.ok(
    julyDelta!.reasons.includes("prepayment"),
    `July delta reasons should include prepayment; got ${JSON.stringify(julyDelta!.reasons)}`
  )

  assert.equal(
    result.validation.billableEqualsMba,
    true,
    `timing-only override must keep billableEqualsMba; delta=${result.validation.deltaExGst}`
  )
  assert.equal(pl.flags.prepaid, true)
  assert.equal(pl.flags.manualBilling, true)
})
