/** B34 (Q20): one Melbourne-calendar rule for "current month" in display. */
// UTC, the CI and Vercel zone: host-local date code fails here on a Sydney host too (RELFIX1, B49 R5).
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import test from "node:test"

import { getMelbourneMonthISO, getMelbourneTodayISO, getMelbourneYesterdayISO } from "../melbourne"

test("AEDT month boundary: 31 Oct 14:00 UTC is 1 Nov 01:00 in Melbourne", () => {
  const at = new Date("2026-10-31T14:00:00Z")
  assert.equal(at.toISOString().slice(0, 7), "2026-10", "the UTC month is still October")
  assert.equal(getMelbourneMonthISO(at), "2026-11")
  assert.equal(getMelbourneTodayISO(at), "2026-11-01")
  assert.equal(getMelbourneYesterdayISO(at), "2026-10-31")
})

test("one second before Melbourne midnight is still the old month", () => {
  assert.equal(getMelbourneMonthISO(new Date("2026-10-31T12:59:59Z")), "2026-10")
  assert.equal(getMelbourneMonthISO(new Date("2026-10-31T13:00:00Z")), "2026-11")
})

test("AEST boundary (+10): 31 May 14:00 UTC is 1 Jun 00:00", () => {
  assert.equal(getMelbourneMonthISO(new Date("2026-05-31T13:59:59Z")), "2026-05")
  assert.equal(getMelbourneMonthISO(new Date("2026-05-31T14:00:00Z")), "2026-06")
})

test("year end: 31 Dec 13:00 UTC is 1 Jan 2027 in Melbourne", () => {
  assert.equal(getMelbourneMonthISO(new Date("2026-12-31T13:00:00Z")), "2027-01")
})

test("mid-month in UTC and Melbourne agree", () => {
  assert.equal(getMelbourneMonthISO(new Date("2026-11-13T02:00:00Z")), "2026-11")
})
