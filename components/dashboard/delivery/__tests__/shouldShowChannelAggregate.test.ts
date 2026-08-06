import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ChannelKey } from "../channels/types"
import { shouldShowChannelAggregate } from "../shouldShowChannelAggregate"

describe("shouldShowChannelAggregate", () => {
  it("search + 1 → false; search + 3 → true", () => {
    assert.equal(shouldShowChannelAggregate("search", 1), false)
    assert.equal(shouldShowChannelAggregate("search", 3), true)
  })

  it("social-meta + 1 → false; social-meta + 2 → true", () => {
    assert.equal(shouldShowChannelAggregate("social-meta", 1), false)
    assert.equal(shouldShowChannelAggregate("social-meta", 2), true)
  })

  it("social-tiktok + 1 → false", () => {
    assert.equal(shouldShowChannelAggregate("social-tiktok", 1), false)
  })

  it("programmatic-display never rolls up (1 / 2 / 5)", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-display", 1), false)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 2), false)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 5), false)
  })

  it("programmatic-video + 4 → false; ad-serving + 2 → false", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-video", 4), false)
    assert.equal(shouldShowChannelAggregate("ad-serving", 2), false)
  })

  it("any key + 0 lines → true (empty-container guard)", () => {
    const keys: ChannelKey[] = [
      "search",
      "social-meta",
      "social-tiktok",
      "programmatic-display",
      "programmatic-video",
      "ad-serving",
    ]
    for (const key of keys) {
      assert.equal(shouldShowChannelAggregate(key, 0), true, key)
    }
  })
})
