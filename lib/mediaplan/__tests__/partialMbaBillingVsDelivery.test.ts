/**
 * M8 (B21): billing vs delivery in a partial MBA's selected months.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  computePartialMbaBillingVsDelivery,
  describePartialMbaGuardRail,
  partialMbaGuardHasFindings,
  type PartialMbaGuardLine,
} from "@/lib/mediaplan/partialMbaBillingVsDelivery"

const OCT = "October 2025"
const NOV = "November 2025"
const DEC = "December 2025"

function gl(over: Partial<PartialMbaGuardLine> & { lineItemId: string }): PartialMbaGuardLine {
  return {
    mediaType: "digiDisplay",
    billingMonths: [],
    deliveryMonths: [],
    flags: { excluded: false, clientPaysForMedia: false },
    ...over,
  }
}

test("equal billing and delivery: nothing to show", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "A",
        billingMonths: [{ month: OCT, amount: 100 }, { month: NOV, amount: 50 }],
        deliveryMonths: [{ month: OCT, amount: 100 }, { month: NOV, amount: 50 }],
      }),
    ],
    selectedMonthYears: [OCT, NOV],
  })
  assert.deepEqual(r.rows, [])
  assert.equal(partialMbaGuardHasFindings(r), false)
  assert.equal(describePartialMbaGuardRail(r), null)
})

test("Prebill into an earlier month (real engine): the later selected month shows billing below delivery", () => {
  const line: LineItemInput = {
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
    billingOverride: {
      mode: "manual",
      reason: "prepayment",
      months: [
        { month: "2026-01", amount: 20_000 },
        { month: "2026-02", amount: 0 },
      ],
      dateBasis: "billing",
    },
  }
  const f = computeCampaignFinancials([line], { feeLoading: { feesearch: 10 } }, {
    campaignStart: new Date(2026, 0, 1),
    campaignEnd: new Date(2026, 1, 28),
    selectedMonthYears: ["February 2026"],
  })
  const r = computePartialMbaBillingVsDelivery({ perLine: f.perLine, selectedMonthYears: ["February 2026"] })
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0]!.monthYear, "February 2026")
  assert.equal(r.rows[0]!.billing, 0)
  assert.ok(r.rows[0]!.delivery > 9_000)
  assert.equal(r.rows[0]!.expected, false)
  assert.equal(r.difference, -r.rows[0]!.delivery)
  assert.match(describePartialMbaGuardRail(r)!, /^Billing is \$[\d,]+\.\d\d below delivery on 1 line in the MBA months\. See MBA & billing\.$/)
})

test("media-only Prebill timing inside the selection: rows show, totals match", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "A",
        billingMonths: [{ month: OCT, amount: 200 }, { month: NOV, amount: 0 }],
        deliveryMonths: [{ month: OCT, amount: 100 }, { month: NOV, amount: 100 }],
      }),
    ],
    selectedMonthYears: [NOV, OCT],
  })
  assert.deepEqual(r.months, [OCT, NOV])
  assert.deepEqual(r.rows.map((x) => [x.monthYear, x.difference]), [[OCT, 100], [NOV, -100]])
  assert.equal(r.difference, 0)
  assert.equal(
    describePartialMbaGuardRail(r),
    "Billing and delivery timing differ on 1 line in the MBA months. The totals match. See MBA & billing."
  )
})

test("client pays for media: shown as expected, not counted as a difference", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "CP",
        billingMonths: [{ month: OCT, amount: 0 }],
        deliveryMonths: [{ month: OCT, amount: 500 }],
        flags: { excluded: false, clientPaysForMedia: true },
      }),
    ],
    selectedMonthYears: [OCT],
  })
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0]!.expected, true)
  assert.equal(r.difference, 0)
  assert.equal(r.expectedDifference, -500)
  assert.equal(r.unexpectedLineCount, 0)
  assert.equal(describePartialMbaGuardRail(r), null)
  assert.equal(partialMbaGuardHasFindings(r), true)
})

test("months outside the selection and excluded lines are ignored", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "A",
        billingMonths: [{ month: OCT, amount: 100 }, { month: DEC, amount: 900 }],
        deliveryMonths: [{ month: OCT, amount: 100 }, { month: DEC, amount: 1 }],
      }),
      gl({
        lineItemId: "X",
        billingMonths: [{ month: OCT, amount: 0 }],
        deliveryMonths: [{ month: OCT, amount: 999 }],
        flags: { excluded: true, clientPaysForMedia: false },
      }),
    ],
    selectedMonthYears: [OCT],
  })
  assert.deepEqual(r.rows, [])
})

test("cents: under a cent is equal, a cent is a difference", () => {
  const base = { lineItemId: "A", deliveryMonths: [{ month: OCT, amount: 100 }] }
  const half = computePartialMbaBillingVsDelivery({
    perLine: [gl({ ...base, billingMonths: [{ month: OCT, amount: 100.004 }] })],
    selectedMonthYears: [OCT],
  })
  assert.equal(half.rows.length, 0)
  const cent = computePartialMbaBillingVsDelivery({
    perLine: [gl({ ...base, billingMonths: [{ month: OCT, amount: 100.01 }] })],
    selectedMonthYears: [OCT],
  })
  assert.equal(cent.rows.length, 1)
  assert.equal(cent.rows[0]!.difference, 0.01)
})

test("a channel added after the partial MBA was set is listed even when billing equals delivery", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "billing-newspaper::PENFOLD020NP1",
        mediaType: "newspaper",
        billingMonths: [{ month: OCT, amount: 300 }],
        deliveryMonths: [{ month: OCT, amount: 300 }],
      }),
      gl({ lineItemId: "billing-ooh::PENFOLD020OH7", mediaType: "ooh" }),
    ],
    selectedMonthYears: [OCT],
    laterAddedMediaKeys: ["newspaper"],
  })
  assert.deepEqual(r.rows, [])
  assert.deepEqual(r.laterAdded, [
    { mediaType: "newspaper", lineItemId: "billing-newspaper::PENFOLD020NP1", billing: 300, delivery: 300 },
  ])
  assert.equal(
    describePartialMbaGuardRail(r),
    "1 line added after the partial MBA was set is in it. See MBA & billing."
  )
})

test("no months given: every month either side has, in date order", () => {
  const r = computePartialMbaBillingVsDelivery({
    perLine: [
      gl({
        lineItemId: "A",
        billingMonths: [{ month: NOV, amount: 1 }],
        deliveryMonths: [{ month: OCT, amount: 1 }],
      }),
    ],
    selectedMonthYears: [],
  })
  assert.deepEqual(r.months, [OCT, NOV])
  assert.equal(r.rows.length, 2)
})
