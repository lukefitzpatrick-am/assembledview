import assert from "node:assert/strict"
import test from "node:test"

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import {
  adServingDollarsByLineFromApprovedSlice,
  adServingMonthWeightsFromDeliverySchedule,
  feeMonthWeightsFromDeliverySchedule,
  firstUsableWeights,
  monthTotalsFromStoredSchedule,
} from "@/lib/docs/workbookServiceMonthWeights"

const SEP = "September 2026"
const OCT = "October 2026"
const NOV = "November 2026"

function line(
  id: string,
  fee: Record<string, number>,
  adServing?: Record<string, number>,
): BillingLineItem {
  return {
    id,
    header1: id,
    header2: "",
    monthlyAmounts: {},
    totalAmount: 0,
    feeMonthlyAmounts: fee,
    ...(adServing ? { adServingMonthlyAmounts: adServing } : {}),
  }
}

/** Server schedules attach one shared lineItems map to every month. */
function schedule(lineItems: BillingMonth["lineItems"]): BillingMonth[] {
  return [SEP, OCT, NOV].map(
    (monthYear) => ({ monthYear, lineItems }) as unknown as BillingMonth,
  )
}

// BICAU006 v24 shape: a fee-free display line in October only, and fee lines
// delivering evenly Sep to Nov. Media share put the display weight on October.
const BIC = schedule({
  digiDisplay: [line("billing-digiDisplay::BICAU006DD1", { [OCT]: 0 })],
  socialMedia: [
    line("billing-socialMedia::BICAU006SM1", { [SEP]: 1582.42, [OCT]: 1635.16, [NOV]: 1582.42 }),
  ],
  progVideo: [
    line(
      "billing-progVideo::BICAU006PV3",
      { [SEP]: 769.23, [OCT]: 794.87, [NOV]: 769.23 },
      { [SEP]: 300, [OCT]: 310, [NOV]: 300 },
    ),
    line(
      "billing-progVideo::BICAU006PV9",
      { [SEP]: 100, [OCT]: 0, [NOV]: 0 },
      { [SEP]: 0, [OCT]: 50, [NOV]: 0 },
    ),
  ],
})

test("fee weights sum each line's delivery fee months once", () => {
  const weights = feeMonthWeightsFromDeliverySchedule({
    deliverySchedule: BIC,
    includeLine: () => true,
  })
  assert.deepEqual(weights, {
    [SEP]: 2451.65,
    [OCT]: 2430.03,
    [NOV]: 2351.65,
  })
})

test("excluded lines carry no fee weight", () => {
  const weights = feeMonthWeightsFromDeliverySchedule({
    deliverySchedule: BIC,
    includeLine: (id) => id !== "billing-progVideo::BICAU006PV9",
  })
  assert.equal(weights[SEP], 2351.65)
})

test("selected MBA months narrow the weights", () => {
  const weights = feeMonthWeightsFromDeliverySchedule({
    deliverySchedule: BIC,
    includeLine: () => true,
    selectedMonthYears: [OCT, NOV],
  })
  assert.deepEqual(Object.keys(weights).sort(), [NOV, OCT].sort())
})

test("ad serving shape scales to the frozen slice amount per bare line id", () => {
  const slice = {
    totalCents: 0,
    lines: [
      { lineItemId: "BICAU006PV3", adservingCents: 91000 },
      { lineItemId: "BICAU006SM1", adservingCents: 0 },
    ],
  }
  const byLine = adServingDollarsByLineFromApprovedSlice(slice)
  assert.ok(byLine)
  assert.equal(byLine.get("BICAU006PV3"), 910)
  const weights = adServingMonthWeightsFromDeliverySchedule({
    deliverySchedule: BIC,
    includeLine: () => true,
    targetDollarsByLine: byLine,
  })
  // PV9 has no slice amount, so it adds nothing.
  assert.deepEqual(weights, { [SEP]: 300, [OCT]: 310, [NOV]: 300 })
})

test("draft ad serving uses each line's own months", () => {
  const weights = adServingMonthWeightsFromDeliverySchedule({
    deliverySchedule: BIC,
    includeLine: () => true,
  })
  assert.deepEqual(weights, { [SEP]: 300, [OCT]: 360, [NOV]: 300 })
})

test("a slice with no ad serving fields returns null", () => {
  assert.equal(adServingDollarsByLineFromApprovedSlice({ lines: [{ lineItemId: "x" }] }), null)
  assert.equal(adServingDollarsByLineFromApprovedSlice(null), null)
})

test("stored schedule month totals parse money strings", () => {
  const stored = JSON.stringify([
    { monthYear: SEP, feeTotal: "$1,000.50", adservingTechFees: "$0.00" },
    { monthYear: OCT, feeTotal: "$0.00", adservingTechFees: "$12.00" },
  ])
  assert.deepEqual(monthTotalsFromStoredSchedule(stored, "feeTotal"), { [SEP]: 1000.5 })
  assert.deepEqual(monthTotalsFromStoredSchedule({ months: JSON.parse(stored) }, "adservingTechFees"), {
    [OCT]: 12,
  })
  assert.deepEqual(monthTotalsFromStoredSchedule("not json", "feeTotal"), {})
})

test("firstUsableWeights skips empty maps", () => {
  assert.equal(firstUsableWeights({}, { a: 0 }, undefined), undefined)
  assert.deepEqual(firstUsableWeights({}, { a: 2 }), { a: 2 })
})
