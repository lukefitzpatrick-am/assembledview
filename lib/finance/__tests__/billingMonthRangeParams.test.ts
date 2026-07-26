import assert from "node:assert/strict"
import test from "node:test"

import {
  MAX_BILLING_MONTH_RANGE_MONTHS,
  parseBillingMonthRangeParams,
} from "../billingApiParams.js"

function okMonths(fromRaw: string | null, toRaw: string | null): string[] {
  const parsed = parseBillingMonthRangeParams(fromRaw, toRaw)
  assert.ok("ok" in parsed && parsed.ok, `expected ok for from=${fromRaw} to=${toRaw}: ${JSON.stringify(parsed)}`)
  return (parsed as { ok: true; months: string[] }).months
}

function errField(fromRaw: string | null, toRaw: string | null): string | undefined {
  const parsed = parseBillingMonthRangeParams(fromRaw, toRaw)
  assert.ok(!("ok" in parsed), `expected error for from=${fromRaw} to=${toRaw}`)
  return (parsed as { error: string; field?: string }).field
}

test("parseBillingMonthRangeParams: FY range expands to 12 ascending months", () => {
  const months = okMonths("2025-07", "2026-06")
  assert.equal(months.length, 12)
  assert.equal(months[0], "2025-07")
  assert.equal(months[5], "2025-12")
  assert.equal(months[6], "2026-01")
  assert.equal(months[11], "2026-06")
})

test("parseBillingMonthRangeParams: from == to yields a single month", () => {
  assert.deepEqual(okMonths("2026-05", "2026-05"), ["2026-05"])
})

test("parseBillingMonthRangeParams: missing either param errors with its field", () => {
  assert.equal(errField(null, "2026-05"), "from")
  assert.equal(errField("2026-05", null), "to")
  assert.equal(errField("", ""), "from")
})

test("parseBillingMonthRangeParams: malformed months rejected", () => {
  assert.equal(errField("2026-13", "2026-12"), "from")
  assert.equal(errField("2026-01", "abc"), "to")
  assert.equal(errField("2026-1", "2026-02"), "from")
})

test("parseBillingMonthRangeParams: from after to rejected", () => {
  assert.equal(errField("2026-06", "2026-05"), "from")
})

test("parseBillingMonthRangeParams: range wider than cap rejected", () => {
  // 25 months: 2024-01 .. 2026-01
  const parsed = parseBillingMonthRangeParams("2024-01", "2026-01")
  assert.ok(!("ok" in parsed))
  assert.match((parsed as { error: string }).error, /Month range too wide/)
  // Exactly the cap is allowed.
  const capped = okMonths("2024-01", "2025-12")
  assert.equal(capped.length, MAX_BILLING_MONTH_RANGE_MONTHS)
})
