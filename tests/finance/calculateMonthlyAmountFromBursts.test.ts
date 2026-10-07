import assert from "node:assert/strict"
import test from "node:test"

import { computeBurstAmounts } from "../../lib/mediaplan/burstAmounts.js"
import { calculateMonthlyAmountFromBursts } from "../../lib/finance/utils.js"

test("client-pays burst contributes no billed media and still keeps the fee", () => {
  const amounts = computeBurstAmounts({
    rawBudget: 10000,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: 20,
  })
  assert.equal(amounts.mediaAmount, 0)
  assert.equal(amounts.feeAmount, 2500)
  const month = calculateMonthlyAmountFromBursts(
    [
      {
        budget: 10000,
        feePct: 20,
        clientPaysForMedia: true,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    ],
    2026,
    1,
  )
  assert.equal(month, 0)
})

test("bonus burst contributes nothing", () => {
  const month = calculateMonthlyAmountFromBursts(
    [
      {
        budget: 5000,
        feePct: 15,
        buyType: "bonus",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      },
    ],
    2026,
    2,
  )
  assert.equal(month, 0)
})

test("gross-in and net-in both bill the same net media", () => {
  const gross = calculateMonthlyAmountFromBursts(
    [
      {
        budget: 12500,
        feePct: 20,
        budgetIncludesFees: true,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    ],
    2026,
    1,
  )
  const net = calculateMonthlyAmountFromBursts(
    [
      {
        budget: 10000,
        feePct: 20,
        budgetIncludesFees: false,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    ],
    2026,
    1,
  )
  assert.equal(gross, 10000)
  assert.equal(net, 10000)
})

test("a burst across 5 and 6 April keeps inclusive civil days and sums to the media", () => {
  const burst = {
    budget: 700,
    feePct: 0,
    startDate: "2026-03-31",
    endDate: "2026-04-06",
  }
  const march = calculateMonthlyAmountFromBursts([burst], 2026, 3)
  const april = calculateMonthlyAmountFromBursts([burst], 2026, 4)
  assert.equal(march, 100)
  assert.equal(april, 600)
  assert.equal(march + april, 700)
})
