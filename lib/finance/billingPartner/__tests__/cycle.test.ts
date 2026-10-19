/**
 * Billing-partner month: before the 17th Sydney, the current month; from the
 * 17th, the next month. The pack shows that month's 17th, 24th, 26th and 28th.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  aaCycleDates,
  billingMonthLabel,
  defaultBillingMonth,
  packSummaryFileName,
  packZipFileName,
} from "@/lib/finance/billingPartner/cycle"

test("before the 17th the cycle is the current Sydney month", () => {
  // 16 Oct 2026 23:00 Sydney (AEDT, UTC+11).
  assert.equal(defaultBillingMonth(new Date("2026-10-16T12:00:00.000Z")), "2026-10-01")
})

test("from the 17th the cycle is the next month, including a year rollover", () => {
  // 17 Oct 2026 00:00 Sydney.
  assert.equal(defaultBillingMonth(new Date("2026-10-16T13:00:00.000Z")), "2026-11-01")
  // 19 Oct 2026, the day this page was built.
  assert.equal(defaultBillingMonth(new Date("2026-10-19T07:00:00.000Z")), "2026-11-01")
  // 17 Dec 2026 00:00 Sydney (AEDT).
  assert.equal(defaultBillingMonth(new Date("2026-12-16T13:00:00.000Z")), "2027-01-01")
})

test("a month shows the four Advertising Associates dates", () => {
  assert.deepEqual(aaCycleDates("2026-11"), [
    { day: 17, ymd: "2026-11-17" },
    { day: 24, ymd: "2026-11-24" },
    { day: 26, ymd: "2026-11-26" },
    { day: 28, ymd: "2026-11-28" },
  ])
  assert.equal(billingMonthLabel("2026-11-01"), "November 2026")
})

test("pack file names use the month label and the Sydney build date", () => {
  assert.equal(packSummaryFileName("2026-11-01"), "AA pack summary November 2026.xlsx")
  assert.equal(
    packZipFileName("2026-11-01", new Date("2026-10-19T07:00:00.000Z")),
    "AA pack November 2026 2026-10-19.zip",
  )
})
