import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { getMelbourneYesterdayISO } from "../index"

describe("getMelbourneYesterdayISO", () => {
  it("returns the day before the supplied asOfDate", () => {
    assert.equal(getMelbourneYesterdayISO("2026-05-22"), "2026-05-21")
  })

  it("handles month boundary", () => {
    assert.equal(getMelbourneYesterdayISO("2026-06-01"), "2026-05-31")
  })

  it("handles year boundary", () => {
    assert.equal(getMelbourneYesterdayISO("2026-01-01"), "2025-12-31")
  })

  it("handles leap day", () => {
    assert.equal(getMelbourneYesterdayISO("2024-03-01"), "2024-02-29")
  })

  it("throws on invalid input", () => {
    assert.throws(() => getMelbourneYesterdayISO("not-a-date"))
  })
})
