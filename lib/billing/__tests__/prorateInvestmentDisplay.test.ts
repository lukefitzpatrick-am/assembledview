import assert from "node:assert/strict"
import test from "node:test"

import {
  aggregateInvestmentDisplayRows,
  aggregateInvestmentShares,
} from "../prorateInvestmentDisplay.js"

test("multi-month burst sums to full amount (fixes over-allocation)", () => {
  const shares = aggregateInvestmentShares([
    { amount: 10000, start: "2026-01-20", end: "2026-02-10" },
  ])

  assert.ok(Math.abs(shares["January 2026"] - 5454.545454545455) < 0.000001)
  assert.ok(Math.abs(shares["February 2026"] - 4545.454545454545) < 0.000001)
  const sum = Object.values(shares).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 10000) < 0.000001)
})

test("single-month burst → one row with full amount", () => {
  const shares = aggregateInvestmentShares([
    { amount: 5000, start: "2026-03-01", end: "2026-03-31" },
  ])

  assert.equal(Object.keys(shares).length, 1)
  assert.equal(shares["March 2026"], 5000)
})

test("two bursts in the same month are summed", () => {
  const shares = aggregateInvestmentShares([
    { amount: 3000, start: "2026-01-01", end: "2026-01-15" },
    { amount: 2000, start: "2026-01-16", end: "2026-01-31" },
  ])

  assert.equal(shares["January 2026"], 5000)
})

test("display rows are in chronological order", () => {
  const rows = aggregateInvestmentDisplayRows([
    { amount: 1000, start: "2026-03-01", end: "2026-03-15" },
    { amount: 2000, start: "2026-01-01", end: "2026-01-15" },
    { amount: 1500, start: "2026-02-01", end: "2026-02-15" },
  ])

  assert.deepEqual(
    rows.map((r) => r.monthYear),
    ["January 2026", "February 2026", "March 2026"],
  )
})

test("invalid and reversed bursts are skipped", () => {
  const shares = aggregateInvestmentShares([
    { amount: 9999, start: "not-a-date", end: "2026-01-15" },
    { amount: 8888, start: "2026-01-20", end: "2026-01-10" },
    { amount: 1000, start: "2026-02-01", end: "2026-02-10" },
  ])

  assert.equal(shares["February 2026"], 1000)
  assert.equal(Object.keys(shares).length, 1)
})
