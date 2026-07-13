import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { mintFrameUrl, signFrameToken, verifyFrameToken } from "../frameSign"

describe("frameSign", () => {
  const prev = process.env.CREATIVE_FRAME_SIGNING_SECRET

  beforeEach(() => {
    process.env.CREATIVE_FRAME_SIGNING_SECRET = "test-secret-min-16-chars"
  })

  afterEach(() => {
    process.env.CREATIVE_FRAME_SIGNING_SECRET = prev
  })

  it("signs and verifies a token", () => {
    const exp = Math.floor(Date.now() / 1000) + 120
    const sig = signFrameToken(42, exp)
    assert.ok(sig)
    assert.equal(verifyFrameToken(42, exp, sig!), true)
    assert.equal(verifyFrameToken(42, exp, "deadbeef".repeat(8)), false)
  })

  it("rejects expired tokens", () => {
    const exp = Math.floor(Date.now() / 1000) - 10
    const sig = signFrameToken(1, exp)!
    assert.equal(verifyFrameToken(1, exp, sig), false)
  })

  it("mints a frame URL", () => {
    const url = mintFrameUrl({ origin: "https://app.example.com", id: 7 })
    assert.match(url!, /^https:\/\/app\.example\.com\/api\/creative-assets\/7\/frame\?/)
  })
})
