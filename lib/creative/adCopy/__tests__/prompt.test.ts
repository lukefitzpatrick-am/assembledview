import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { PLATFORM_LIMITS, trimVariantToLimits } from "../prompt"

describe("trimVariantToLimits", () => {
  it("trims facebook-feed fields to hard limits", () => {
    const out = trimVariantToLimits("facebook-feed", {
      angle: "benefit",
      primaryText: "x".repeat(200),
      headline: "y".repeat(40),
      description: "z".repeat(40),
      cta: "Learn More",
    })
    assert.equal(out.primaryText.length, PLATFORM_LIMITS["facebook-feed"].primaryText)
    assert.equal(out.headline.length, PLATFORM_LIMITS["facebook-feed"].headline)
    assert.equal(out.description.length, PLATFORM_LIMITS["facebook-feed"].description)
  })

  it("clears description for tiktok", () => {
    const out = trimVariantToLimits("tiktok", {
      angle: "hook",
      primaryText: "Hi",
      headline: "H",
      description: "should go",
      cta: "Learn More",
    })
    assert.equal(out.description, "")
  })
})
