import assert from "node:assert/strict"
import test from "node:test"

import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"

const ZERO = {
  mediaAmount: 0,
  deliveryMediaAmount: 0,
  feeAmount: 0,
  totalAmount: 0,
} as const

const FLAG_COMBOS: Array<{
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
}> = [
  { budgetIncludesFees: false, clientPaysForMedia: false },
  { budgetIncludesFees: true, clientPaysForMedia: false },
  { budgetIncludesFees: false, clientPaysForMedia: true },
  { budgetIncludesFees: true, clientPaysForMedia: true },
]

test("bonus -> all four outputs 0 for every budgetIncludesFees x clientPaysForMedia combo", () => {
  for (const flags of FLAG_COMBOS) {
    const result = computeBurstAmounts({
      rawBudget: 10_000,
      feePct: 15,
      buyType: "bonus",
      ...flags,
    })
    assert.deepEqual(result, ZERO, `flags=${JSON.stringify(flags)}`)
  }
})

test("package_inclusions -> all four outputs 0 for every flag combo", () => {
  for (const flags of FLAG_COMBOS) {
    const result = computeBurstAmounts({
      rawBudget: 10_000,
      feePct: 15,
      buyType: "package_inclusions",
      ...flags,
    })
    assert.deepEqual(result, ZERO, `flags=${JSON.stringify(flags)}`)
  }
})

test("budgetIncludesFees: fee = budget*pct/100; netMedia = budget*(100-pct)/100", () => {
  const budget = 10_000
  const pct = 10
  const fee = budget * (pct / 100)
  const netMedia = budget * ((100 - pct) / 100)

  const result = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    feePct: pct,
  })
  assert.equal(result.feeAmount, fee)
  assert.equal(result.mediaAmount, netMedia)
  assert.equal(result.deliveryMediaAmount, netMedia)
  assert.equal(result.totalAmount, netMedia + fee)

  const clientPays = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: true,
    clientPaysForMedia: true,
    feePct: pct,
  })
  assert.equal(clientPays.feeAmount, fee)
  assert.equal(clientPays.mediaAmount, 0)
  assert.equal(clientPays.deliveryMediaAmount, netMedia)
  assert.equal(clientPays.totalAmount, fee)
})

test("clientPaysForMedia: media = 0; fee = (budget/(100-pct))*pct; deliveryMedia = budget", () => {
  const budget = 9_000
  const pct = 10
  const fee = (budget / (100 - pct)) * pct

  const result = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: pct,
  })
  assert.equal(result.mediaAmount, 0)
  assert.equal(result.deliveryMediaAmount, budget)
  assert.equal(result.feeAmount, fee)
  assert.equal(result.totalAmount, fee)
})

test("standard: media = budget; fee = (budget*pct)/(100-pct)", () => {
  const budget = 9_000
  const pct = 10
  const fee = (budget * pct) / (100 - pct)

  const result = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: pct,
  })
  assert.equal(result.mediaAmount, budget)
  assert.equal(result.deliveryMediaAmount, budget)
  assert.equal(result.feeAmount, fee)
  assert.equal(result.totalAmount, budget + fee)
})

test("pct === 100 guard returns fee 0, not Infinity (clientPays + standard)", () => {
  const budget = 5_000

  const clientPays = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: 100,
  })
  assert.equal(clientPays.feeAmount, 0)
  assert.ok(Number.isFinite(clientPays.feeAmount))
  assert.equal(clientPays.mediaAmount, 0)
  assert.equal(clientPays.deliveryMediaAmount, budget)
  assert.equal(clientPays.totalAmount, 0)

  const standard = computeBurstAmounts({
    rawBudget: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 100,
  })
  assert.equal(standard.feeAmount, 0)
  assert.ok(Number.isFinite(standard.feeAmount))
  assert.equal(standard.mediaAmount, budget)
  assert.equal(standard.deliveryMediaAmount, budget)
  assert.equal(standard.totalAmount, budget)
})

test('buyType casing/whitespace: "Bonus" and " bonus " both zero', () => {
  for (const buyType of ["Bonus", " bonus "]) {
    const result = computeBurstAmounts({
      rawBudget: 10_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 15,
      buyType,
    })
    assert.deepEqual(result, ZERO, `buyType=${JSON.stringify(buyType)}`)
  }
})
