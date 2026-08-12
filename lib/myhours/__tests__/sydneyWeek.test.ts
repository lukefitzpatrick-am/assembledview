import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sydneyWeekRange, sydneyLastNWeekStarts } from "../sydneyWeek.js"

describe("sydneyWeekRange", () => {
  it("Monday→Sunday in Australia/Sydney (Mon midweek)", () => {
    // Wednesday 6 Aug 2025 12:00 UTC = Wed 6 Aug 22:00 Sydney (AEST, UTC+10)
    // Actually: 2025-08-06T02:00:00Z = Wed 6 Aug 12:00 Sydney
    const wed = new Date("2025-08-06T02:00:00.000Z")
    const { startYmd, endYmd } = sydneyWeekRange(wed)
    assert.equal(startYmd, "2025-08-04") // Monday
    assert.equal(endYmd, "2025-08-10") // Sunday
  })

  it("Sunday still belongs to the week that started the prior Monday", () => {
    // Sunday 10 Aug 2025 02:00 UTC → Sunday afternoon Sydney
    const sun = new Date("2025-08-10T02:00:00.000Z")
    const { startYmd, endYmd } = sydneyWeekRange(sun)
    assert.equal(startYmd, "2025-08-04")
    assert.equal(endYmd, "2025-08-10")
  })

  it("Monday is the start of its own week", () => {
    const mon = new Date("2025-08-04T02:00:00.000Z")
    const { startYmd, endYmd } = sydneyWeekRange(mon)
    assert.equal(startYmd, "2025-08-04")
    assert.equal(endYmd, "2025-08-10")
  })
})

describe("sydneyLastNWeekStarts", () => {
  it("returns N Monday starts ending with the current week", () => {
    const wed = new Date("2025-08-06T02:00:00.000Z")
    const weeks = sydneyLastNWeekStarts(4, wed)
    assert.deepEqual(weeks, [
      "2025-07-14",
      "2025-07-21",
      "2025-07-28",
      "2025-08-04",
    ])
  })
})
