import assert from "node:assert/strict"
import test from "node:test"

import {
  sydneyBusinessDaysUntil,
  subtractSydneyBusinessDays,
} from "../sydneyBusinessDays.js"

test("subtracts Sydney weekdays; weekend-crossing (Mon − 1 wd → prior Fri)", () => {
  // 2026-08-17 is Monday. One weekday back crosses Sat/Sun → Friday 14 Aug.
  assert.equal(subtractSydneyBusinessDays("2026-08-17", 1), "2026-08-14")
  assert.equal(subtractSydneyBusinessDays("2026-08-17", 3), "2026-08-12")
  // Friday − 1 wd stays in-week.
  assert.equal(subtractSydneyBusinessDays("2026-08-14", 1), "2026-08-13")
})

test("n=0 returns the same civil day; calendar-day path is not this helper", () => {
  assert.equal(subtractSydneyBusinessDays("2026-08-17", 0), "2026-08-17")
})

test("sydneyBusinessDaysUntil: inclusive remaining weekdays from as-of to due", () => {
  // Mon 17 → Fri 21 is 4 weekdays later (Tue, Wed, Thu, Fri) if counting exclusive
  // "within 5 business days" uses remaining weekdays until due, 0 if same day, negative if past.
  assert.equal(sydneyBusinessDaysUntil("2026-08-17", "2026-08-17"), 0)
  assert.equal(sydneyBusinessDaysUntil("2026-08-17", "2026-08-18"), 1)
  assert.equal(sydneyBusinessDaysUntil("2026-08-14", "2026-08-17"), 1) // Fri → Mon
  assert.equal(sydneyBusinessDaysUntil("2026-08-18", "2026-08-17"), -1)
})
