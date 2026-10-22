import assert from "node:assert/strict"
import { test } from "node:test"

import {
  adminCountToLabel,
  adminPacingCountToISO,
  composerCountToISO,
  countToCacheKeyPart,
  resolveAdminPacingDays,
} from "../countTo"
import { pacingAsAtISO } from "../expectedForWindow"
import { computeDaysPassed, computePacing, computeStatus } from "../maths"

test("count-to day is the day before the view day, across month and DST edges", () => {
  assert.equal(adminPacingCountToISO("2026-10-22"), "2026-10-21")
  assert.equal(adminPacingCountToISO("2026-11-01"), "2026-10-31")
  assert.equal(adminPacingCountToISO("2026-10-05"), "2026-10-04")
  assert.equal(adminPacingCountToISO("2027-01-01"), "2026-12-31")
})

test("resolveAdminPacingDays defaults to Melbourne today and its yesterday", () => {
  // 21 Oct 2026 22:30 UTC is 22 Oct 09:30 in Melbourne (AEDT).
  const now = new Date("2026-10-21T22:30:00Z")
  assert.deepEqual(resolveAdminPacingDays(null, now), {
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
  })
  assert.deepEqual(resolveAdminPacingDays("  ", now), {
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
  })
  assert.deepEqual(resolveAdminPacingDays("not-a-day", now), {
    asOfDate: "2026-10-22",
    countToDate: "2026-10-21",
  })
  assert.deepEqual(resolveAdminPacingDays("2026-09-30", now), {
    asOfDate: "2026-09-30",
    countToDate: "2026-09-29",
  })
})

test("admin count-to day matches the client strip as-at for a live campaign", () => {
  const now = new Date("2026-10-21T22:30:00Z")
  const { countToDate } = resolveAdminPacingDays(null, now)
  assert.equal(countToDate, pacingAsAtISO("2026-12-31", now))
})

test("composerCountToISO keeps the old day when no count-to day is passed", () => {
  assert.equal(composerCountToISO({ asOfDate: "2026-10-22" }), "2026-10-22")
  assert.equal(composerCountToISO({ asOfDate: "2026-10-22", countToDate: null }), "2026-10-22")
  assert.equal(
    composerCountToISO({ asOfDate: "2026-10-22", countToDate: "2026-10-21" }),
    "2026-10-21",
  )
})

test("cache key part differs between the old and new rule", () => {
  assert.equal(countToCacheKeyPart(undefined), "to:asof")
  assert.equal(countToCacheKeyPart("2026-10-21"), "to:2026-10-21")
})

test("a campaign starting on the view day has nothing expected and is not started", () => {
  const { asOfDate, countToDate } = resolveAdminPacingDays("2026-10-22")
  assert.equal(computeDaysPassed("2026-10-22", "2026-11-30", countToDate), 0)
  const out = computePacing({
    lineItemBudget: 1000,
    startDate: "2026-10-22",
    endDate: "2026-11-30",
    spendToDate: 0,
    spendYesterday: 0,
    impressionsToDate: 0,
    clicksToDate: 0,
    conversionsToDate: 0,
    revenueToDate: 0,
    asOfDate: countToDate,
  })
  assert.equal(out.expectedSpend, 0)
  assert.equal(out.status, "not_started")
  // Listing uses the view day, which is the start day.
  assert.equal(asOfDate, "2026-10-22")
})

test("a campaign that ended on the count-to day is fully expected, not completed", () => {
  const { countToDate } = resolveAdminPacingDays("2026-10-22")
  const out = computePacing({
    lineItemBudget: 3100,
    startDate: "2026-10-01",
    endDate: "2026-10-21",
    spendToDate: 3100,
    spendYesterday: 100,
    impressionsToDate: 0,
    clicksToDate: 0,
    conversionsToDate: 0,
    revenueToDate: 0,
    asOfDate: countToDate,
  })
  assert.equal(out.expectedPct, 1)
  assert.equal(out.expectedSpend, 3100)
  assert.equal(out.daysRemaining, 0)
  assert.notEqual(out.status, "completed")
  assert.equal(
    computeStatus({
      asOfDate: countToDate,
      startDate: "2026-10-01",
      endDate: "2026-10-20",
      spendToDate: 1,
      daysPassed: 20,
      projectionVariancePct: 0,
    }),
    "completed",
  )
})

test("days left still runs from the view day", () => {
  const { countToDate } = resolveAdminPacingDays("2026-10-22")
  const out = computePacing({
    lineItemBudget: 3100,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    spendToDate: 0,
    spendYesterday: 0,
    impressionsToDate: 0,
    clicksToDate: 0,
    conversionsToDate: 0,
    revenueToDate: 0,
    asOfDate: countToDate,
  })
  // 1 to 21 Oct counted (21 days); 22 to 31 Oct left (10 days).
  assert.equal(out.daysPassed, 21)
  assert.equal(out.daysRemaining, 10)
})

test("header label names the count-to day", () => {
  assert.equal(adminCountToLabel("2026-10-22", "2026-10-21"), "As of 2026-10-22, counted to 2026-10-21")
  assert.equal(adminCountToLabel("2026-10-22", undefined), "As of 2026-10-22")
})
