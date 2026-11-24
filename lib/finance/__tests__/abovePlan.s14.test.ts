/**
 * S14 A: `centsAbovePlan` (month and campaign checks, $1 tolerance, capped at
 * the record) and `planBillingTotalCents` (the billing-month function's month
 * totals summed over a version).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { centsAbovePlan, planBillingTotalCents } from "../abovePlan"

// A plan that bills $1,000.00 this month and $1,500.00 in total; nothing billed yet.
const base = { toBillCents: 100000, planMonthCents: 100000, planTotalCents: 150000, billedMonthCents: 0, billedTotalCents: 0 }

test("equal to plan is not above plan", () => {
  assert.equal(centsAbovePlan(base), 0)
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 50000 }), 0)
})

test("the $1 tolerance: 1 cent and 100 cents over are not held, 101 cents over is", () => {
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 50001 }), 0)
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 50100 }), 0)
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 50101 }), 101)
  assert.equal(centsAbovePlan({ ...base, billedMonthCents: 100 }), 0)
  assert.equal(centsAbovePlan({ ...base, billedMonthCents: 101 }), 101)
})

test("the month check: an invoice already billed this month makes this one above plan for the month", () => {
  // The campaign still has room ($500 left), but this month is already billed in full.
  assert.equal(centsAbovePlan({ ...base, billedMonthCents: 100000, billedTotalCents: 0 }), 100000)
  assert.equal(centsAbovePlan({ ...base, billedMonthCents: 30000, billedTotalCents: 30000 }), 30000)
})

test("the campaign check: billed so far plus this record against the plan's total", () => {
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 80000 }), 30000)
})

test("the larger excess wins, capped at the record itself", () => {
  assert.equal(centsAbovePlan({ ...base, billedMonthCents: 20000, billedTotalCents: 90000 }), 40000)
  assert.equal(centsAbovePlan({ ...base, billedTotalCents: 900000 }), 100000)
})

test("a $0 or credit record is never above plan", () => {
  assert.equal(centsAbovePlan({ ...base, toBillCents: 0, planMonthCents: 0, billedTotalCents: 900000 }), 0)
  assert.equal(centsAbovePlan({ ...base, toBillCents: -5000, planMonthCents: -5000, billedTotalCents: 900000 }), 0)
})

function scheduleMonth(monthYear: string, media: number, fee: number) {
  const money = (n: number) => "$" + n.toFixed(2)
  return {
    monthYear,
    mediaTotal: money(media),
    feeTotal: money(fee),
    totalAmount: money(media + fee),
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: { search: [{ id: "AC-001SE1", header1: "Google", monthlyAmounts: { [monthYear]: media }, totalAmount: media }] },
  }
}

test("planBillingTotalCents sums every billing month, fee included, in cents", () => {
  const version = {
    id: 101,
    mba_number: "AC-001",
    campaign_status: "booked",
    campaign_start_date: "2026-05-01",
    campaign_end_date: "2026-07-31",
    billingSchedule: [scheduleMonth("May 2026", 800, 200), scheduleMonth("June 2026", 400, 100)],
    deliverySchedule: [scheduleMonth("May 2026", 800, 0)],
  }
  assert.equal(planBillingTotalCents(version), 100000 + 50000)
  assert.equal(planBillingTotalCents({ id: 1 }), 0)
})
