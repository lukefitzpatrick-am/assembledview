/**
 * Campaign delivery-phase derivation. Injected `today` is a UTC instant that
 * maps to a known Australia/Sydney civil day (02:00Z is always that YMD).
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  CAMPAIGN_PHASES,
  resolveCampaignPhase,
} from "@/lib/mediaplan/campaignPhase"

const START = "2026-03-10"
const END = "2026-03-20"

function sydneyToday(ymd: string): Date {
  return new Date(`${ymd}T02:00:00.000Z`)
}

function resolve(
  status: unknown,
  todayYmd: string,
  dates: { startDate?: string | null; endDate?: string | null } = {
    startDate: START,
    endDate: END,
  }
) {
  return resolveCampaignPhase({
    status,
    startDate: dates.startDate,
    endDate: dates.endDate,
    today: sydneyToday(todayYmd),
  })
}

test("CAMPAIGN_PHASES is the six derived values", () => {
  assert.deepEqual(CAMPAIGN_PHASES, [
    "planned",
    "approved",
    "booked",
    "live",
    "completed",
    "cancelled",
  ])
})

test("cancelled wins even when dates are in range — never live", () => {
  const result = resolve("cancelled", "2026-03-15")
  assert.equal(result.phase, "cancelled")
  assert.equal(result.derived, false)
  assert.notEqual(result.phase, "live")
})

test("cancelled is case-insensitive", () => {
  assert.equal(resolve("Cancelled", "2026-03-15").phase, "cancelled")
})

test("legacy draft maps to planned, not derived", () => {
  const result = resolve("draft", "2026-03-15")
  assert.equal(result.phase, "planned")
  assert.equal(result.derived, false)
})

test("planned stays planned even in range", () => {
  const result = resolve("planned", "2026-03-15")
  assert.equal(result.phase, "planned")
  assert.equal(result.derived, false)
})

test("approved with missing start → approved, not derived, reason no dates", () => {
  const result = resolve("approved", "2026-03-15", {
    startDate: null,
    endDate: END,
  })
  assert.deepEqual(result, {
    phase: "approved",
    derived: false,
    reason: "no dates",
  })
})

test("booked with missing end → booked, not derived, reason no dates", () => {
  const result = resolve("booked", "2026-03-15", {
    startDate: START,
    endDate: undefined,
  })
  assert.deepEqual(result, {
    phase: "booked",
    derived: false,
    reason: "no dates",
  })
})

test("approved with both dates missing → approved, reason no dates", () => {
  const result = resolve("approved", "2026-03-15", {
    startDate: null,
    endDate: null,
  })
  assert.equal(result.phase, "approved")
  assert.equal(result.derived, false)
  assert.equal(result.reason, "no dates")
})

test("booked with both dates missing → booked, reason no dates", () => {
  const result = resolve("booked", "2026-03-15", {
    startDate: "",
    endDate: "   ",
  })
  assert.equal(result.phase, "booked")
  assert.equal(result.derived, false)
  assert.equal(result.reason, "no dates")
})

test("approved before start stays approved", () => {
  const result = resolve("approved", "2026-03-09")
  assert.equal(result.phase, "approved")
  assert.equal(result.derived, false)
})

test("booked before start stays booked", () => {
  const result = resolve("booked", "2026-03-09")
  assert.equal(result.phase, "booked")
  assert.equal(result.derived, false)
})

test("approved in range → live (derived)", () => {
  const result = resolve("approved", "2026-03-15")
  assert.equal(result.phase, "live")
  assert.equal(result.derived, true)
})

test("booked in range → live (derived)", () => {
  const result = resolve("booked", "2026-03-15")
  assert.equal(result.phase, "live")
  assert.equal(result.derived, true)
})

test("today === start is inclusive live", () => {
  const approved = resolve("approved", START)
  const booked = resolve("booked", START)
  assert.equal(approved.phase, "live")
  assert.equal(approved.derived, true)
  assert.equal(booked.phase, "live")
  assert.equal(booked.derived, true)
})

test("today === end is inclusive live", () => {
  const approved = resolve("approved", END)
  const booked = resolve("booked", END)
  assert.equal(approved.phase, "live")
  assert.equal(approved.derived, true)
  assert.equal(booked.phase, "live")
  assert.equal(booked.derived, true)
})

test("approved after end → completed (derived)", () => {
  const result = resolve("approved", "2026-03-21")
  assert.equal(result.phase, "completed")
  assert.equal(result.derived, true)
})

test("booked after end → completed (derived)", () => {
  const result = resolve("booked", "2026-03-21")
  assert.equal(result.phase, "completed")
  assert.equal(result.derived, true)
})

test("legacy completed stays completed, not derived, even in range", () => {
  const result = resolve("completed", "2026-03-15")
  assert.equal(result.phase, "completed")
  assert.equal(result.derived, false)
})

test("unrecognised status → planned, reason unknown status", () => {
  const result = resolve("in progress", "2026-03-15")
  assert.deepEqual(result, {
    phase: "planned",
    derived: false,
    reason: "unknown status",
  })
})

test("empty status → planned, reason unknown status", () => {
  const result = resolve("", "2026-03-15")
  assert.equal(result.phase, "planned")
  assert.equal(result.derived, false)
  assert.equal(result.reason, "unknown status")
})

test("persisted live is unrecognised — never treated as a stored phase", () => {
  const result = resolve("live", "2026-03-15")
  assert.equal(result.phase, "planned")
  assert.equal(result.reason, "unknown status")
})
