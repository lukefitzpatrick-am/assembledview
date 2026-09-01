import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  consumePullXeroRateLimit,
  resetPullXeroRateLimitForTests,
} from "../pullXeroRateLimit"

afterEach(() => {
  resetPullXeroRateLimitForTests()
})

describe("pull-xero rate limit", () => {
  it("allows the first run", () => {
    const r = consumePullXeroRateLimit("user-a", 1_000)
    assert.equal(r.ok, true)
  })

  it("returns 429 seconds remaining for a second run within a minute", () => {
    assert.equal(consumePullXeroRateLimit("user-a", 1_000).ok, true)
    const r = consumePullXeroRateLimit("user-a", 1_000 + 15_000)
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.retryAfterSeconds, 45)
    }
  })

  it("is per user — another user is not blocked", () => {
    assert.equal(consumePullXeroRateLimit("user-a", 1_000).ok, true)
    assert.equal(consumePullXeroRateLimit("user-b", 1_000 + 1_000).ok, true)
  })

  it("allows a run after the window", () => {
    assert.equal(consumePullXeroRateLimit("user-a", 1_000).ok, true)
    assert.equal(consumePullXeroRateLimit("user-a", 1_000 + 60_000).ok, true)
  })
})
