/**
 * R1 — lock the ad-serving eligible channel set.
 * Sources: AD_SERVING_ELIGIBLE_MEDIA_TYPES (resolver) and
 * AD_SERVING_SCHEDULE_MEDIA_TYPES (computeSchedule distribute list).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AD_SERVING_ELIGIBLE_MEDIA_TYPES } from "@/lib/billing/adServingRateResolver"
import { AD_SERVING_SCHEDULE_MEDIA_TYPES } from "@/lib/billing/computeSchedule"

/** Exact eligible set — do not narrow without an explicit product decision. */
const EXPECTED_ELIGIBLE = [
  "digiAudio",
  "digiDisplay",
  "digiVideo",
  "bvod",
  "progAudio",
  "progVideo",
  "progBvod",
  "progOoh",
  "progDisplay",
] as const

const EXPECTED_INELIGIBLE = [
  "search",
  "socialMedia",
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "integration",
  "influencers",
  "production",
] as const

describe("R1 ad-serving eligible media types", () => {
  it("resolver set is EXACTLY the locked eligible list", () => {
    const fromResolver = [...AD_SERVING_ELIGIBLE_MEDIA_TYPES].sort()
    const expected = [...EXPECTED_ELIGIBLE].sort()
    assert.deepEqual(fromResolver, expected)
  })

  it("computeSchedule distribute list is EXACTLY the locked eligible list", () => {
    const fromSchedule = [...AD_SERVING_SCHEDULE_MEDIA_TYPES].sort()
    const expected = [...EXPECTED_ELIGIBLE].sort()
    assert.deepEqual(fromSchedule, expected)
  })

  it("resolver and computeSchedule lists agree with each other", () => {
    const fromResolver = [...AD_SERVING_ELIGIBLE_MEDIA_TYPES].sort()
    const fromSchedule = [...AD_SERVING_SCHEDULE_MEDIA_TYPES].sort()
    assert.deepEqual(
      fromResolver,
      fromSchedule,
      "FINDING: AD_SERVING_ELIGIBLE_MEDIA_TYPES ≠ AD_SERVING_SCHEDULE_MEDIA_TYPES — do not silently align"
    )
  })

  it("ineligible channels are NOT in either set", () => {
    for (const key of EXPECTED_INELIGIBLE) {
      assert.equal(
        AD_SERVING_ELIGIBLE_MEDIA_TYPES.has(key),
        false,
        `resolver must not include ${key}`
      )
      assert.equal(
        (AD_SERVING_SCHEDULE_MEDIA_TYPES as readonly string[]).includes(key),
        false,
        `computeSchedule must not include ${key}`
      )
    }
  })
})
