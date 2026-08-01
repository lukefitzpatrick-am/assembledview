import assert from "node:assert/strict"
import test from "node:test"

import { deriveSowBillingRecordsFromScopes } from "../deriveScopeSowReceivables.js"
import {
  extractLineItemsFromScopeSchedule,
  summarizeScopeScheduleCoverage,
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

test("partial schedule: 2 of 12 months bill only those 2; reports the gap", () => {
  const schedule = [
    { month: "January 2026", cost: 10_000 },
    { month: "February 2026", cost: 10_000 },
  ]
  const scopeCostTotal = [{ description: "Fees", cost: 120_000 }]
  const scope = {
    id: 1,
    scope_id: "PARTIAL-SOW",
    client_name: "Acme",
    project_name: "Partial year",
    project_status: "approved",
    billing_schedule: schedule,
    cost: scopeCostTotal,
  }

  let billedMonths = 0
  let totalBilled = 0
  for (let month = 1; month <= 12; month++) {
    const records = deriveSowBillingRecordsFromScopes(
      [scope],
      2026,
      month,
      () => 1,
      { includeNonApprovedScopes: false },
    )
    if (records.length > 0) {
      billedMonths++
      totalBilled += records[0].total
    }
  }

  assert.equal(billedMonths, 2, "only scheduled months must produce receivables")
  assert.equal(totalBilled, 20_000, "must not substitute full scope cost for gaps")

  const coverage = summarizeScopeScheduleCoverage(schedule, 2026)
  assert.equal(coverage.scheduledMonths, 2)
  assert.equal(coverage.unscheduledMonths, 10)
  assert.equal(coverage.gapLabel, "10 months unscheduled")
})

test("month present at $0 contributes nothing (no full-cost fallback)", () => {
  const schedule = [
    { month: "January 2026", cost: 10_000 },
    { month: "February 2026", cost: 0 },
  ]
  const records = deriveSowBillingRecordsFromScopes(
    [
      {
        id: 1,
        scope_id: "ZERO-MONTH",
        client_name: "Acme",
        project_name: "Zero Feb",
        project_status: "approved",
        billing_schedule: schedule,
        cost: [{ description: "Fees", cost: 50_000 }],
      },
    ],
    2026,
    2,
    () => 1,
    { includeNonApprovedScopes: false },
  )
  assert.equal(records.length, 0)
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
