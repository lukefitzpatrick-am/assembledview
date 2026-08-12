import assert from "node:assert/strict"
import { test } from "node:test"
import { sydneyYmdFromUtcInstant } from "../sydneyWeek.js"

test("UTC evening → next Sydney civil day", () => {
  // 2026-08-12T23:00:00Z = 2026-08-13 09:00 AEST (UTC+10)
  assert.equal(
    sydneyYmdFromUtcInstant("2026-08-12T23:00:00.000Z"),
    "2026-08-13"
  )
})

test("UTC morning still same Sydney day in winter? use fixed +10 example", () => {
  assert.equal(
    sydneyYmdFromUtcInstant("2026-08-13T01:00:00.000Z"),
    "2026-08-13"
  )
})
