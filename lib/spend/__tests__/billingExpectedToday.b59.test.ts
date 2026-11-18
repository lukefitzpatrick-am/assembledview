/**
 * B59 (C-277, S9 A): expected spend to date from a billing schedule counts
 * days to the Melbourne day, never the host day (UTC on Vercel). It is the
 * last fallback of `resolveCampaignExpectedSpend` (campaign dashboard,
 * portfolio pacing rows, the strip, campaign reports), all on the server, so
 * this file runs in UTC with the clock mocked where the UTC day is the day
 * before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 * On the Melbourne day the first month is whole and day 1 of the next month
 * is in; on the UTC day the next month has not started.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { calculateExpectedSpendToDateFromBillingSchedule } from "@/lib/spend/billingScheduleExpectedToDate"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", months: ["2026-11-01", "2026-12-01"], start: "2026-11-01", end: "2026-12-31", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", months: ["2026-06-01", "2026-07-01"], start: "2026-06-01", end: "2026-07-31", label: "1 Jul 07:00 AEST" },
] as const

test("the process zone is UTC in this file, as on Vercel", () => {
  assert.equal(new Date(Date.UTC(2026, 11, 1)).getHours(), 0)
})

for (const { at, months, start, end, label } of INSTANTS) {
  test(`billing expected to date includes Melbourne day 1 of the new month (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const schedule = [
      { monthYear: months[0], totalAmount: 3000 },
      { monthYear: months[1], totalAmount: 3100 },
    ]
    // 3000 for the whole first month, plus 1 of 31 days of 3100.
    assert.equal(calculateExpectedSpendToDateFromBillingSchedule(schedule, start, end), 3100)
  })
}
