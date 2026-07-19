/**
 * Unit tests for Australia/Sydney burst date helpers (Step 3).
 * Run under TZ=UTC to prove runtime-local independence.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { formatBurstDateLocal, parseBurstDateLocal } from "@/lib/mediaplan/burstDate"

function assertLocalYmd(date: Date, y: number, m: number, d: number) {
  assert.equal(date.getFullYear(), y)
  assert.equal(date.getMonth(), m - 1)
  assert.equal(date.getDate(), d)
  assert.equal(date.getHours(), 0)
  assert.equal(date.getMinutes(), 0)
  assert.equal(date.getSeconds(), 0)
}

test("formatBurstDateLocal: YYYY-MM-DD string passes through", () => {
  assert.equal(formatBurstDateLocal("2026-07-01"), "2026-07-01")
  assert.equal(formatBurstDateLocal(" 2026-07-31 "), "2026-07-31")
})

test("formatBurstDateLocal: AEST local-midnight instant → Sydney calendar day", () => {
  // Client AEST: new Date(2026, 6, 1) ≡ 2026-06-30T14:00:00.000Z
  const aestJuly1 = new Date(Date.UTC(2026, 6, 1) - 10 * 3600 * 1000)
  assert.equal(aestJuly1.toISOString(), "2026-06-30T14:00:00.000Z")
  assert.equal(formatBurstDateLocal(aestJuly1), "2026-07-01")

  const aestJuly31 = new Date(Date.UTC(2026, 6, 31) - 10 * 3600 * 1000)
  assert.equal(aestJuly31.toISOString(), "2026-07-30T14:00:00.000Z")
  assert.equal(formatBurstDateLocal(aestJuly31), "2026-07-31")
})

test("formatBurstDateLocal: legacy …Z string → Sydney calendar day", () => {
  assert.equal(formatBurstDateLocal("2026-06-30T14:00:00.000Z"), "2026-07-01")
  assert.equal(formatBurstDateLocal("2026-07-30T14:00:00.000Z"), "2026-07-31")
})

test("formatBurstDateLocal: AEDT (UTC+11) midnight instant → correct Sydney day", () => {
  // Sydney midnight 2026-01-15 (AEDT) = 2026-01-14T13:00:00.000Z
  const aedtMidnight = new Date("2026-01-14T13:00:00.000Z")
  assert.equal(formatBurstDateLocal(aedtMidnight), "2026-01-15")
  assert.equal(formatBurstDateLocal("2026-01-14T13:00:00.000Z"), "2026-01-15")
})

test("parseBurstDateLocal: YYYY-MM-DD → local midnight Y/M/D", () => {
  assertLocalYmd(parseBurstDateLocal("2026-07-01"), 2026, 7, 1)
  assertLocalYmd(parseBurstDateLocal("2026-07-31"), 2026, 7, 31)
})

test("parseBurstDateLocal: legacy AEST …Z → intended Sydney day as local midnight", () => {
  assertLocalYmd(parseBurstDateLocal("2026-06-30T14:00:00.000Z"), 2026, 7, 1)
  assertLocalYmd(parseBurstDateLocal("2026-07-30T14:00:00.000Z"), 2026, 7, 31)
})

test("parseBurstDateLocal: legacy AEDT …Z → intended Sydney day as local midnight", () => {
  assertLocalYmd(parseBurstDateLocal("2026-01-14T13:00:00.000Z"), 2026, 1, 15)
})

test("round-trip: format then parse preserves Sydney civil day", () => {
  const instants = [
    new Date("2026-06-30T14:00:00.000Z"), // AEST July 1
    new Date("2026-07-30T14:00:00.000Z"), // AEST July 31
    new Date("2026-01-14T13:00:00.000Z"), // AEDT Jan 15
  ]
  for (const instant of instants) {
    const ymd = formatBurstDateLocal(instant)
    const parsed = parseBurstDateLocal(ymd)
    assert.equal(formatBurstDateLocal(parsed), ymd)
    assert.equal(parsed.getFullYear(), Number(ymd.slice(0, 4)))
    assert.equal(parsed.getMonth() + 1, Number(ymd.slice(5, 7)))
    assert.equal(parsed.getDate(), Number(ymd.slice(8, 10)))
  }
})

test("round-trip: legacy Z through parse then format stays on Sydney day", () => {
  assert.equal(formatBurstDateLocal(parseBurstDateLocal("2026-06-30T14:00:00.000Z")), "2026-07-01")
  assert.equal(formatBurstDateLocal(parseBurstDateLocal("2026-01-14T13:00:00.000Z")), "2026-01-15")
})
