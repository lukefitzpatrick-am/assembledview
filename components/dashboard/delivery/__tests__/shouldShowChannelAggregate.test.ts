import assert from "node:assert/strict"
import { describe, it } from "vitest"

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

  it("programmatic-video + 4 → false", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-video", 4), false)
  })

  it("bvod + 2 → true", () => {
    assert.equal(shouldShowChannelAggregate("bvod", 2), true)
  })

  it("bvod + 1 → false (flat render preserved)", () => {
    assert.equal(shouldShowChannelAggregate("bvod", 1), false)
  })

  it("digital-display / digital-video / digital-audio + 2 → true", () => {
    assert.equal(shouldShowChannelAggregate("digital-display", 2), true)
    assert.equal(shouldShowChannelAggregate("digital-video", 2), true)
    assert.equal(shouldShowChannelAggregate("digital-audio", 2), true)
  })

  it("existing key behaviour is unchanged (search roll-up; programmatic never)", () => {
    assert.equal(shouldShowChannelAggregate("search", 1), false)
    assert.equal(shouldShowChannelAggregate("search", 3), true)
    assert.equal(shouldShowChannelAggregate("social-meta", 2), true)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 5), false)
    assert.equal(shouldShowChannelAggregate("programmatic-video", 4), false)
  })

  it("any key + 0 lines → true (empty-container guard)", () => {
    const keys: ChannelKey[] = [
      "search",
      "social-meta",
      "social-tiktok",
      "programmatic-display",
      "programmatic-video",
      "digital-display",
      "digital-video",
      "digital-audio",
      "bvod",
    ]
    for (const key of keys) {
      assert.equal(shouldShowChannelAggregate(key, 0), true, key)
    }
  })
})
