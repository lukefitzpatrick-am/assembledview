import assert from "node:assert/strict"
import test from "node:test"

import { computeBurstAmounts } from "../../mediaplan/burstAmounts"
import { campaignTotals, lineTotals } from "../burst"

test("gross-in at 15% splits the entered budget", () => {
  const totals = lineTotals(
    { bursts: [{ budget: 10000 }], budgetIncludesFees: true },
    { feePct: 15 },
  )
  assert.equal(totals.mediaCents, 850000)
  assert.equal(totals.feeCents, 150000)
  assert.equal(totals.totalCents, 1000000)
})

test("net-in at 15% grosses the fee up", () => {
  const totals = lineTotals({ bursts: [{ budget: 8500 }] }, { feePct: 15 })
  assert.equal(totals.mediaCents, 850000)
  assert.equal(totals.feeCents, 150000)
  assert.equal(totals.totalCents, 1000000)
})

test("client-pays keeps the publisher media and the agency fee", () => {
  const totals = lineTotals(
    { bursts: [{ budget: 10000 }], clientPaysForMedia: true },
    { feePct: 20 },
  )
  assert.equal(totals.mediaCents, 0)
  assert.equal(totals.feeCents, 250000)
  assert.equal(totals.clientPaysMediaCents, 1000000)
  assert.equal(totals.deliverableMediaCents, 1000000)
})

test("bonus and package inclusions match computeBurstAmounts", () => {
  for (const buyType of ["bonus", "package_inclusions"]) {
    const totals = lineTotals({ bursts: [{ budget: 4000 }], buyType }, { feePct: 15 })
    const one = computeBurstAmounts({
      rawBudget: 4000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 15,
      buyType,
    })
    assert.equal(totals.mediaCents, Math.round(one.mediaAmount * 100))
    assert.equal(totals.feeCents, Math.round(one.feeAmount * 100))
    assert.equal(totals.totalCents, 0)
  }
})

test("a 100% fee stays finite", () => {
  const totals = lineTotals({ bursts: [{ budget: 1000 }] }, { feePct: 100 })
  assert.equal(Number.isFinite(totals.feeCents), true)
  assert.equal(totals.feeCents, 0)
  assert.equal(totals.mediaCents, 100000)
  assert.equal(totals.totalCents, 100000)
})

test("production media type is its own bucket", () => {
  const totals = lineTotals(
    { mediaType: "production", buyType: "production", bursts: [{ budget: 2000 }] },
    { feePct: 0 },
  )
  assert.equal(totals.mediaCents, 0)
  assert.equal(totals.productionCents, 200000)
  assert.equal(totals.totalCents, 200000)
  const campaign = campaignTotals(
    [
      { mediaType: "production", buyType: "production", bursts: [{ budget: 2000 }] },
      { bursts: [{ budget: 1000 }] },
    ],
    { feePct: 0 },
  )
  assert.equal(campaign.mediaCents, 100000)
  assert.equal(campaign.productionCents, 200000)
  assert.equal(campaign.totalCents, 300000)
})

test("several bursts sum exactly in cents", () => {
  const totals = lineTotals(
    { bursts: [{ budget: 10.005 }, { budget: 10.005 }, { budget: "10.00" }] },
    { feePct: 0 },
  )
  assert.equal(totals.mediaCents, 1001 + 1001 + 1000)
  const campaign = campaignTotals(
    [{ bursts: [{ budget: 10 }] }, { bursts: [{ budget: 20 }] }],
    { feePct: 0 },
  )
  assert.equal(campaign.mediaCents, 3000)
  assert.equal(campaign.totalCents, 3000)
})
