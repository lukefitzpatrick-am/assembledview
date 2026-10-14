import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { impressionWeightedPosition } from "../position"

describe("impression-weighted position", () => {
  it("weights each day's position by that day's impressions", () => {
    const position = impressionWeightedPosition([
      { position: 10, impressions: 100 },
      { position: 2, impressions: 300 },
    ])
    assert.equal(position, (10 * 100 + 2 * 300) / 400)
  })

  it("skips a day with no impressions", () => {
    assert.equal(impressionWeightedPosition([{ position: 4, impressions: 0 }]), null)
    assert.equal(impressionWeightedPosition([{ position: null, impressions: 10 }]), null)
  })
})
