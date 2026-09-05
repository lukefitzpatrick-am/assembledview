/**
 * C-95: client-pays media lines keep agency fee on the billing schedule.
 * Media months stay 0; fee months are the engine fee.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { generateBillingLineItems } from "../generateBillingLineItems.js"

const MONTHS = [
  { monthYear: "July 2026" },
  { monthYear: "August 2026" },
  { monthYear: "September 2026" },
]

const GLENDA_SOCIAL = {
  line_item_id: "glenda008SM1",
  clientPaysForMedia: true,
  budgetIncludesFees: false,
  feePercentage: 20,
  buyType: "cpm",
  bursts: [
    {
      startDate: "2026-07-01",
      endDate: "2026-09-18",
      budget: "20000",
      buyAmount: "10",
    },
  ],
}

test("C-95: client-pays billing line has media 0 and engine fee months", () => {
  const lines = generateBillingLineItems(
    [GLENDA_SOCIAL],
    "socialMedia",
    MONTHS,
    "billing"
  )
  assert.equal(lines.length, 1)
  const line = lines[0]!
  assert.equal(line.clientPaysForMedia, true)
  assert.equal(line.totalAmount, 0)
  for (const month of MONTHS) {
    assert.equal(line.monthlyAmounts[month.monthYear] ?? 0, 0)
  }
  const feeTotal = Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(feeTotal * 100) / 100, 5000)
  assert.equal(Math.round((line.totalFeeAmount ?? 0) * 100) / 100, 5000)
})

test("C-95: delivery basis still carries client-pays media (fee unchanged)", () => {
  const lines = generateBillingLineItems(
    [GLENDA_SOCIAL],
    "socialMedia",
    MONTHS,
    "delivery"
  )
  assert.equal(lines.length, 1)
  const line = lines[0]!
  assert.equal(Math.round(line.totalAmount * 100) / 100, 20_000)
  const feeTotal = Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(feeTotal * 100) / 100, 5000)
})
