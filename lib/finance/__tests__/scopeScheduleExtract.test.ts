import assert from "node:assert/strict"
import test from "node:test"

import { deriveSowBillingRecordsFromScopes } from "../deriveScopeSowReceivables.js"
import {
  extractLineItemsFromScopeSchedule,
} from "../scopeScheduleExtract.js"

/** Flat monthly SOW schedule: Jan/Feb/Mar 2026 at $10k each (no nested lineItems). */
const flatTenKSchedule = [
  { month: "January 2026", cost: 10_000 },
  { month: "February 2026", cost: 10_000 },
  { month: "March 2026", cost: 10_000 },
]

test("extractLineItemsFromScopeSchedule: flat month cost emits one line for that month", () => {
  const jan = extractLineItemsFromScopeSchedule(flatTenKSchedule, 2026, 1)
  assert.equal(jan.length, 1)
  assert.equal(jan[0].amount, 10_000)
  assert.equal(jan[0].itemCode, "SOW")

  const feb = extractLineItemsFromScopeSchedule(flatTenKSchedule, 2026, 2)
  assert.equal(feb.length, 1)
  assert.equal(feb[0].amount, 10_000)

  const missing = extractLineItemsFromScopeSchedule(flatTenKSchedule, 2026, 4)
  assert.equal(missing.length, 0)
})

test("nested lineItems still win over flat month cost", () => {
  const schedule = [
    {
      month: "January 2026",
      cost: 99_999,
      lineItems: [
        { itemCode: "SOW", mediaType: "Scope of Work", description: "A", amount: 4_000 },
        { itemCode: "SOW", mediaType: "Scope of Work", description: "B", amount: 6_000 },
      ],
    },
  ]
  const items = extractLineItemsFromScopeSchedule(schedule, 2026, 1)
  assert.equal(items.length, 2)
  assert.equal(
    items.reduce((s, li) => s + li.amount, 0),
    10_000
  )
})

test("3-month $10k schedule → 3 × $10k receivables totalling $30k (not $30k × 3)", () => {
  const scopeCostTotal = [
    { description: "Fees", cost: 30_000 },
  ]

  const months = [
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ] as const

  const monthlyTotals: number[] = []
  for (const { year, month } of months) {
    const records = deriveSowBillingRecordsFromScopes(
      [
        {
          id: 1,
          scope_id: "KRUSTY-SOW-TEST",
          client_name: "Krusty Krab",
          project_name: "Monthly SOW",
          project_status: "approved",
          billing_schedule: flatTenKSchedule,
          cost: scopeCostTotal,
        },
      ],
      year,
      month,
      () => 1,
      { includeNonApprovedScopes: false }
    )
    assert.equal(records.length, 1, `expected one SOW receivable for ${year}-${month}`)
    assert.equal(records[0].total, 10_000, `month ${month} must be $10k, not full scope $30k`)
    monthlyTotals.push(records[0].total)
  }

  const sum = monthlyTotals.reduce((s, n) => s + n, 0)
  assert.equal(sum, 30_000)
  assert.deepEqual(monthlyTotals, [10_000, 10_000, 10_000])
})
