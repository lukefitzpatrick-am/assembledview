import assert from "node:assert/strict"
import test from "node:test"
import { assertCoreScheduleParity } from "../assertCoreScheduleParity.js"
import type { BillingMonth } from "../../billing/types.js"

function month(
  monthYear: string,
  media: number,
  fee: number,
  lines: Array<{ id: string; media: number; fee: number }>
): BillingMonth {
  return {
    monthYear,
    mediaTotal: `$${media.toFixed(2)}`,
    feeTotal: `$${fee.toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: `$${(media + fee).toFixed(2)}`,
    mediaCosts: {},
    lineItems: {
      search: lines.map((l) => ({
        id: l.id,
        header1: "X",
        header2: "Y",
        monthlyAmounts: { [monthYear]: l.media },
        feeMonthlyAmounts: { [monthYear]: l.fee },
        totalAmount: l.media,
        totalFeeAmount: l.fee,
      })),
    },
  } as BillingMonth
}

test("assertCoreScheduleParity: matching schedules ok", () => {
  const expected = [
    month("Jan 2026", 100, 10, [{ id: "billing-search::a", media: 100, fee: 10 }]),
  ]
  const persisted = JSON.parse(JSON.stringify(expected)) as BillingMonth[]
  const result = assertCoreScheduleParity(expected, persisted)
  assert.equal(result.ok, true)
})

test("assertCoreScheduleParity: month media mismatch fails", () => {
  const expected = [
    month("Jan 2026", 100, 10, [{ id: "billing-search::a", media: 100, fee: 10 }]),
  ]
  const persisted = [
    month("Jan 2026", 100.05, 10, [{ id: "billing-search::a", media: 100.05, fee: 10 }]),
  ]
  const result = assertCoreScheduleParity(expected, persisted)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(result.deltas.some((d) => d.includes("media")))
  }
})

test("assertCoreScheduleParity: within $0.01 tolerance passes", () => {
  const expected = [
    month("Jan 2026", 100, 10, [{ id: "billing-search::a", media: 100, fee: 10 }]),
  ]
  const persisted = [
    month("Jan 2026", 100.005, 10.005, [
      { id: "billing-search::a", media: 100.005, fee: 10.005 },
    ]),
  ]
  const result = assertCoreScheduleParity(expected, persisted)
  assert.equal(result.ok, true)
})
