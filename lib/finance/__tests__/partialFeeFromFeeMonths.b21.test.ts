/**
 * M8 (B21): with `partialFeeFromFeeMonths`, the month-scoped fee is each
 * line's fee billing months in the selection, the same as the approved slice.
 * Unset: the media share, as before.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { computeApprovedSlice } from "@/lib/finance/approvedSlice"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"

const START = new Date(2026, 0, 1)
const END = new Date(2026, 1, 28)

function line(over: Partial<LineItemInput> = {}): LineItemInput {
  return {
    lineItemId: "billing-search::golf023SE1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 20_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [
      { startDate: "2026-01-01", endDate: "2026-01-31", budget: 10_000 },
      { startDate: "2026-02-01", endDate: "2026-02-28", budget: 10_000 },
    ],
    approval: "approved",
    ...over,
  }
}

const FEES = { feeLoading: { feesearch: 10 } }
const opts = (months: string[], on?: boolean) => ({
  campaignStart: START,
  campaignEnd: END,
  selectedMonthYears: months,
  ...(on === undefined ? {} : { partialFeeFromFeeMonths: on }),
})

function sliceFeeDollars(f: ReturnType<typeof computeCampaignFinancials>, months: string[]): number {
  const slice = computeApprovedSlice({ financials: f, selectedMonthYears: months })
  return slice.lines.reduce((s, l) => s + l.feeCents, 0) / 100
}

test("media-only Prebill into January: February fee follows the fee months, as the slice does", () => {
  const prebill = line({
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      months: [
        { month: "2026-01", amount: 20_000 },
        { month: "2026-02", amount: 0 },
      ],
      dateBasis: "billing",
    },
  })
  const off = computeCampaignFinancials([prebill], FEES, opts(["February 2026"]))
  const unset = computeCampaignFinancials([prebill], FEES, opts(["February 2026"], false))
  const on = computeCampaignFinancials([prebill], FEES, opts(["February 2026"], true))
  // Off: media share. February has no media, so no fee.
  assert.equal(off.mbaScopeTotals.fee, 0)
  assert.deepEqual(unset.mbaScopeTotals, off.mbaScopeTotals)
  // On: the fee bills in its own months.
  assert.ok(on.mbaScopeTotals.fee > 0)
  assert.equal(on.mbaScopeTotals.fee, sliceFeeDollars(on, ["February 2026"]))
  assert.equal(on.mbaScopeTotals.grossMedia, off.mbaScopeTotals.grossMedia)
  assert.equal(
    on.mbaScopeTotals.nettExGst,
    Math.round((on.mbaScopeTotals.grossMedia + on.mbaScopeTotals.fee + on.mbaScopeTotals.adServing + on.mbaScopeTotals.production) * 100) / 100
  )
})

test("hand-edited fee timing is read from the fee months", () => {
  const feeMoved = line({
    feeOverride: {
      mode: "manual",
      months: [
        { month: "2026-01", amount: 0 },
        { month: "2026-02", amount: 2_000 },
      ],
      dateBasis: "billing",
    },
  })
  const full = computeCampaignFinancials([feeMoved], FEES, { campaignStart: START, campaignEnd: END })
  const on = computeCampaignFinancials([feeMoved], FEES, opts(["February 2026"], true))
  const off = computeCampaignFinancials([feeMoved], FEES, opts(["February 2026"]))
  assert.equal(on.mbaScopeTotals.fee, sliceFeeDollars(on, ["February 2026"]))
  assert.equal(on.mbaScopeTotals.fee, full.mbaScopeTotals.fee)
  assert.notEqual(off.mbaScopeTotals.fee, on.mbaScopeTotals.fee)
})

test("plain line: both ways give the same fee; whole campaign selected is unscoped either way", () => {
  const plain = line()
  const off = computeCampaignFinancials([plain], FEES, opts(["January 2026"]))
  const on = computeCampaignFinancials([plain], FEES, opts(["January 2026"], true))
  assert.equal(on.mbaScopeTotals.fee, off.mbaScopeTotals.fee)
  const all = ["January 2026", "February 2026"]
  assert.deepEqual(
    computeCampaignFinancials([plain], FEES, opts(all, true)).mbaScopeTotals,
    computeCampaignFinancials([plain], FEES, opts(all)).mbaScopeTotals
  )
})

test("a line with no fee months in the schedule keeps the media share", async () => {
  const { scopeCampaignFinancialsToSelectedMonths } = await import("@/lib/finance/computeCampaignFinancials")
  const full = computeCampaignFinancials([line()], FEES, { campaignStart: START, campaignEnd: END })
  const stripped = {
    ...full,
    billingSchedule: full.billingSchedule.map((m) => ({ ...m, lineItems: undefined })),
  }
  const on = scopeCampaignFinancialsToSelectedMonths(stripped, ["January 2026"], { feeFromFeeMonths: true })
  const off = scopeCampaignFinancialsToSelectedMonths(stripped, ["January 2026"])
  assert.equal(on.mbaScopeTotals.fee, off.mbaScopeTotals.fee)
  assert.ok(off.mbaScopeTotals.fee > 0)
})

test("excluded lines stay out either way", () => {
  const excluded = line({ lineItemId: "billing-search::golf023SE2", approval: "excluded" })
  const on = computeCampaignFinancials([line(), excluded], FEES, opts(["January 2026"], true))
  const onlyOne = computeCampaignFinancials([line()], FEES, opts(["January 2026"], true))
  assert.equal(on.mbaScopeTotals.fee, onlyOne.mbaScopeTotals.fee)
})
