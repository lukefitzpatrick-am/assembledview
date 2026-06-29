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

  assert.ok(Math.abs(shares["January 2026"] - 5454.545454545455) < 0.000001)
  assert.ok(Math.abs(shares["February 2026"] - 4545.454545454545) < 0.000001)
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

  assert.ok(Math.abs(endingOnFirst["February 2026"] - 10000 / 13) < 0.000001)
  assert.ok(Math.abs(startingOnLast["January 2026"] - 10000 / 11) < 0.000001)
})
