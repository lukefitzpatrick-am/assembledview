import assert from "node:assert/strict"
import test from "node:test"

import {
  auFyBoundsDateOnly,
  auFyFilterOptions,
  auFyShortLabel,
  campaignDateOnly,
  campaignOverlapsAuFinancialYear,
  parseAuFySearchParam,
  serializeAuFySearchParam,
} from "@/lib/dates/auFinancialYear"

test("auFyBoundsDateOnly: 1 Jul – 30 Jun inclusive", () => {
  assert.deepEqual(auFyBoundsDateOnly(2025), { start: "2025-07-01", end: "2026-06-30" })
  assert.deepEqual(auFyBoundsDateOnly(2026), { start: "2026-07-01", end: "2027-06-30" })
})

test("campaignDateOnly: leading YYYY-MM-DD only — no UTC reinterpretation", () => {
  assert.equal(campaignDateOnly("2026-06-30"), "2026-06-30")
  // Timestamp suffix ignored; calendar date as written (no Melbourne shift).
  assert.equal(campaignDateOnly("2026-06-30T14:00:00.000Z"), "2026-06-30")
  assert.equal(campaignDateOnly("2026-07-01T00:00:00+10:00"), "2026-07-01")
  assert.equal(campaignDateOnly(""), null)
  assert.equal(campaignDateOnly(null), null)
  assert.equal(campaignDateOnly("30/06/2026"), null)
  assert.equal(campaignDateOnly("2026-13-01"), null)
})

test("auFyShortLabel / options default to current start-year FY", () => {
  assert.equal(auFyShortLabel(2026), "FY26")
  const opts = auFyFilterOptions(new Date(2026, 7, 2)) // 2 Aug 2026 local → FY26
  assert.equal(opts[0]!.value, 2026)
  assert.equal(opts[0]!.label, "FY26")
  assert.equal(opts[1]!.value, 2025)
  assert.equal(opts[2]!.value, 2027)
  assert.equal(opts[3]!.value, "all")
})

test("parse/serialize URL: absent = current; all; previous year", () => {
  const today = new Date(2026, 7, 2)
  assert.equal(parseAuFySearchParam(null, today), 2026)
  assert.equal(parseAuFySearchParam(undefined, today), 2026)
  assert.equal(parseAuFySearchParam("all", today), "all")
  assert.equal(parseAuFySearchParam("2025", today), 2025)
  assert.equal(parseAuFySearchParam("nope", today), 2026)
  assert.equal(serializeAuFySearchParam(2026, today), null)
  assert.equal(serializeAuFySearchParam(2025, today), "2025")
  assert.equal(serializeAuFySearchParam("all", today), "all")
})

test("overlap truth table — both dates present", () => {
  const fy = 2026 // 2026-07-01 .. 2027-06-30
  // Fully inside
  assert.equal(campaignOverlapsAuFinancialYear("2026-08-01", "2026-12-01", fy), true)
  // Spans FY start (starts before, ends inside)
  assert.equal(campaignOverlapsAuFinancialYear("2026-01-01", "2026-08-01", fy), true)
  // Spans FY end
  assert.equal(campaignOverlapsAuFinancialYear("2027-06-01", "2027-09-01", fy), true)
  // Fully contains FY
  assert.equal(campaignOverlapsAuFinancialYear("2025-01-01", "2028-01-01", fy), true)
  // Touches FY start boundary
  assert.equal(campaignOverlapsAuFinancialYear("2026-07-01", "2026-07-01", fy), true)
  // Touches FY end boundary
  assert.equal(campaignOverlapsAuFinancialYear("2027-06-30", "2027-06-30", fy), true)
  // Ends day before FY
  assert.equal(campaignOverlapsAuFinancialYear("2026-01-01", "2026-06-30", fy), false)
  // Starts day after FY
  assert.equal(campaignOverlapsAuFinancialYear("2027-07-01", "2027-12-01", fy), false)
})

test("overlap truth table — null / partial dates", () => {
  const fy = 2026
  // Both missing → All only
  assert.equal(campaignOverlapsAuFinancialYear(null, null, fy), false)
  assert.equal(campaignOverlapsAuFinancialYear("", "", fy), false)
  assert.equal(campaignOverlapsAuFinancialYear(null, null, "all"), true)
  // Start only inside
  assert.equal(campaignOverlapsAuFinancialYear("2026-09-15", null, fy), true)
  // Start only outside
  assert.equal(campaignOverlapsAuFinancialYear("2026-06-30", null, fy), false)
  // End only inside
  assert.equal(campaignOverlapsAuFinancialYear(null, "2027-01-10", fy), true)
  // End only outside
  assert.equal(campaignOverlapsAuFinancialYear(null, "2027-07-01", fy), false)
  // All includes everything including missing
  assert.equal(campaignOverlapsAuFinancialYear(null, "2020-01-01", "all"), true)
  assert.equal(campaignOverlapsAuFinancialYear("2020-01-01", null, "all"), true)
})

test("30 Jun / 1 Jul boundaries across FY edge", () => {
  // FY25 = 2025-07-01 .. 2026-06-30; FY26 = 2026-07-01 .. 2027-06-30
  assert.equal(campaignOverlapsAuFinancialYear("2026-06-30", "2026-06-30", 2025), true)
  assert.equal(campaignOverlapsAuFinancialYear("2026-06-30", "2026-06-30", 2026), false)
  assert.equal(campaignOverlapsAuFinancialYear("2026-07-01", "2026-07-01", 2025), false)
  assert.equal(campaignOverlapsAuFinancialYear("2026-07-01", "2026-07-01", 2026), true)
  // Campaign spanning the Jul 1 cut
  assert.equal(campaignOverlapsAuFinancialYear("2026-06-15", "2026-07-15", 2025), true)
  assert.equal(campaignOverlapsAuFinancialYear("2026-06-15", "2026-07-15", 2026), true)
})
