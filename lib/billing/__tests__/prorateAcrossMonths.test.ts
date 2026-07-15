import assert from "node:assert/strict"
import test from "node:test"

import { prorateAcrossMonths } from "../prorateAcrossMonths.js"

test("prorates a clean straddle across caller month keys", () => {
  const shares = prorateAcrossMonths({
    amount: 10000,
    burstStart: "2026-01-20",
    burstEnd: "2026-02-10",
    monthKeys: ["January 2026", "February 2026"],
  })

  // 12/22 and 10/22 of $10,000 → cent-reconciled via largest remainder
  assert.equal(shares["January 2026"], 5454.55)
  assert.equal(shares["February 2026"], 4545.45)
  assert.equal(
    Math.round((shares["January 2026"]! + shares["February 2026"]!) * 100),
    1_000_000
  )
})

test("monthly shares sum exactly to amount after cent reconciliation", () => {
  const amount = 4265.33
  const monthKeys = [
    "January 2026",
    "February 2026",
    "March 2026",
    "April 2026",
    "May 2026",
    "June 2026",
    "July 2026",
    "August 2026",
    "September 2026",
    "October 2026",
    "November 2026",
    "December 2026",
  ]
  const shares = prorateAcrossMonths({
    amount,
    burstStart: "2026-01-01",
    burstEnd: "2026-12-31",
    monthKeys,
  })
  const sum = Object.values(shares).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(sum * 100), Math.round(amount * 100))
  for (const v of Object.values(shares)) {
    assert.equal(Math.round(v * 100), v * 100)
  }
})

test("allocates a single-day burst wholly to that month", () => {
  const shares = prorateAcrossMonths({
    amount: 10000,
    burstStart: "2026-01-15",
    burstEnd: "2026-01-15",
    monthKeys: ["January 2026", "February 2026"],
  })

  assert.equal(shares["January 2026"], 10000)
  assert.equal(shares["February 2026"] ?? 0, 0)
})

test("returns no allocation for reversed dates", () => {
  const shares = prorateAcrossMonths({
    amount: 10000,
    burstStart: "2026-01-15",
    burstEnd: "2026-01-14",
    monthKeys: ["January 2026"],
  })

  assert.deepEqual(shares, {})
})

test("handles first-day and last-day month edges", () => {
  const endingOnFirst = prorateAcrossMonths({
    amount: 10000,
    burstStart: "2026-01-20",
    burstEnd: "2026-02-01",
    monthKeys: ["January 2026", "February 2026"],
  })
  const startingOnLast = prorateAcrossMonths({
    amount: 10000,
    burstStart: "2026-01-31",
    burstEnd: "2026-02-10",
    monthKeys: ["January 2026", "February 2026"],
  })

  // 1/13 and 1/11 of $10,000 after cent reconciliation
  assert.equal(endingOnFirst["February 2026"], 769.23)
  assert.equal(startingOnLast["January 2026"], 909.09)
  assert.equal(
    Math.round(
      ((endingOnFirst["January 2026"] ?? 0) + (endingOnFirst["February 2026"] ?? 0)) * 100
    ),
    1_000_000
  )
  assert.equal(
    Math.round(
      ((startingOnLast["January 2026"] ?? 0) + (startingOnLast["February 2026"] ?? 0)) * 100
    ),
    1_000_000
  )
})
