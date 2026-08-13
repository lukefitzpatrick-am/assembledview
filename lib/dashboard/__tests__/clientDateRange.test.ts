import assert from "node:assert/strict"
import test from "node:test"

import {
  CLIENT_ALL_TIME_END,
  CLIENT_ALL_TIME_START,
  campaignFlightOverlapsRange,
  clampMonthlyAmountsToRange,
  resolveClientDashboardRange,
} from "../clientDateRange"

const NOW = new Date(2026, 7, 13) // 13 Aug 2026 local → FY26 = 2026-07-01 .. 2027-06-30

test("resolveClientDashboardRange: no params equals current AU FY (not all-time)", () => {
  const resolved = resolveClientDashboardRange({ now: NOW })
  assert.equal(resolved.rangeStartISO, "2026-07-01")
  assert.equal(resolved.rangeEndISO, "2027-06-30")
  assert.notEqual(resolved.rangeStartISO, CLIENT_ALL_TIME_START)
})

test("resolveClientDashboardRange: fy param translates to that FY window", () => {
  assert.deepEqual(resolveClientDashboardRange({ fy: "2025", now: NOW }), {
    rangeStartISO: "2025-07-01",
    rangeEndISO: "2026-06-30",
  })
  assert.deepEqual(resolveClientDashboardRange({ fy: "all", now: NOW }), {
    rangeStartISO: CLIENT_ALL_TIME_START,
    rangeEndISO: CLIENT_ALL_TIME_END,
  })
})

test("resolveClientDashboardRange: startDate/endDate win over fy; inverted swapped; invalid ignored", () => {
  assert.deepEqual(
    resolveClientDashboardRange({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      fy: "2025",
      now: NOW,
    }),
    { rangeStartISO: "2026-03-01", rangeEndISO: "2026-03-31" },
  )
  assert.deepEqual(
    resolveClientDashboardRange({
      startDate: "2026-06-01",
      endDate: "2026-03-01",
      now: NOW,
    }),
    { rangeStartISO: "2026-03-01", rangeEndISO: "2026-06-01" },
  )
  assert.deepEqual(
    resolveClientDashboardRange({ startDate: "13/08/2026", endDate: "nope", now: NOW }),
    { rangeStartISO: "2026-07-01", rangeEndISO: "2027-06-30" },
  )
})

test("campaignFlightOverlapsRange: overlap not containment; missing dates excluded", () => {
  assert.equal(
    campaignFlightOverlapsRange("2026-01-01", "2026-12-31", "2026-07-01", "2027-06-30"),
    true,
  )
  assert.equal(
    campaignFlightOverlapsRange("2025-01-01", "2025-06-30", "2026-07-01", "2027-06-30"),
    false,
  )
  assert.equal(campaignFlightOverlapsRange(null, null, "2026-07-01", "2027-06-30"), false)
  assert.equal(
    campaignFlightOverlapsRange("2026-08-01", null, "2026-07-01", "2027-06-30"),
    true,
  )
})

test("clampMonthlyAmountsToRange: half-inside campaign contributes only inside months", () => {
  const months = [
    { yearMonth: "2026-06", amount: 100 },
    { yearMonth: "2026-07", amount: 200 },
    { yearMonth: "2026-08", amount: 300 },
  ]
  assert.equal(clampMonthlyAmountsToRange(months, "2026-07-01", "2027-06-30"), 500)
  assert.equal(clampMonthlyAmountsToRange(months, "2026-08-01", "2026-08-31"), 300)
})
