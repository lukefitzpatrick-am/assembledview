import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { pullXeroRetryAfterSeconds } from "../pullXeroRateLimit"

describe("pull-xero rate limit window", () => {
  it("allows when this user has never pulled", () => {
    assert.equal(pullXeroRetryAfterSeconds(null, 1_000), null)
  })

  it("returns seconds remaining for a second run within a minute", () => {
    const r = pullXeroRetryAfterSeconds(1_000, 1_000 + 15_000)
    assert.equal(r, 45)
  })

  it("allows a run after the window", () => {
    assert.equal(pullXeroRetryAfterSeconds(1_000, 1_000 + 60_000), null)
  })
})
