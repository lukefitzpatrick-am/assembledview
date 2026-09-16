import assert from "node:assert/strict"
import { describe, it } from "vitest"

import type { ChannelKey } from "../channels/types"
import {
  shouldShowChannelAggregate,
  shouldShowChannelSectionSummary,
} from "../shouldShowChannelAggregate"

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

  it("social-reddit + 1 → false; social-reddit + 2 → true", () => {
    assert.equal(shouldShowChannelAggregate("social-reddit", 1), false)
    assert.equal(shouldShowChannelAggregate("social-reddit", 2), true)
  })

  it("programmatic-display never rolls up (1 / 2 / 5)", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-display", 1), false)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 2), false)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 5), false)
  })

  it("programmatic-video + 4 → false", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-video", 4), false)
  })

  it("programmatic-ooh never rolls up (1 / 2 / 4)", () => {
    assert.equal(shouldShowChannelAggregate("programmatic-ooh", 1), false)
    assert.equal(shouldShowChannelAggregate("programmatic-ooh", 2), false)
    assert.equal(shouldShowChannelAggregate("programmatic-ooh", 4), false)
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
    assert.equal(shouldShowChannelAggregate("programmatic-ooh", 4), false)
  })

  it("plan-only never rolls up", () => {
    assert.equal(shouldShowChannelAggregate("plan-only", 1), false)
    assert.equal(shouldShowChannelAggregate("plan-only", 3), false)
  })

  it("programmatic 2+ lines show the section summary (chips + chart), not the mixed deliverable roll-up", () => {
    assert.equal(shouldShowChannelSectionSummary("programmatic-display", 2), true)
    assert.equal(shouldShowChannelSectionSummary("programmatic-video", 3), true)
    assert.equal(shouldShowChannelSectionSummary("programmatic-ooh", 2), true)
    assert.equal(shouldShowChannelAggregate("programmatic-display", 2), false)
    assert.equal(shouldShowChannelAggregate("programmatic-video", 3), false)
    assert.equal(shouldShowChannelAggregate("programmatic-ooh", 2), false)
  })

  it("programmatic 1 line stays flat (no section summary)", () => {
    assert.equal(shouldShowChannelSectionSummary("programmatic-display", 1), false)
    assert.equal(shouldShowChannelSectionSummary("programmatic-video", 1), false)
    assert.equal(shouldShowChannelSectionSummary("programmatic-ooh", 1), false)
  })

  it("social summary gate stays aligned with the full aggregate", () => {
    assert.equal(shouldShowChannelSectionSummary("social-meta", 2), true)
    assert.equal(shouldShowChannelSectionSummary("social-meta", 1), false)
    assert.equal(shouldShowChannelSectionSummary("search", 3), true)
  })

  it("any key + 0 lines → true (empty-container guard)", () => {
    const keys: ChannelKey[] = [
      "search",
      "social-meta",
      "social-tiktok",
      "social-reddit",
      "programmatic-display",
      "programmatic-video",
      "programmatic-ooh",
      "digital-display",
      "digital-video",
      "digital-audio",
      "bvod",
      "plan-only",
    ]
    for (const key of keys) {
      assert.equal(shouldShowChannelAggregate(key, 0), true, key)
    }
  })
})
