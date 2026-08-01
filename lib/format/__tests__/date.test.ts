import assert from "node:assert/strict"
import test from "node:test"
import { formatDateRange, formatDateRangeCompact } from "../date.js"

test("formatDateRange same-year collapses year onto end", () => {
  assert.equal(formatDateRange("2026-04-01", "2026-12-31"), "1 Apr – 31 Dec 2026")
})

test("formatDateRangeCompact uses 2-digit year", () => {
  assert.equal(formatDateRangeCompact("2026-04-01", "2026-12-31"), "1 Apr – 31 Dec 26")
})

test("formatDateRangeCompact same-month keeps day–day month yy", () => {
  assert.equal(formatDateRangeCompact("2026-04-01", "2026-04-30"), "1 – 30 Apr 26")
})
