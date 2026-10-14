import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatChange, relativeChange } from "../change"

describe("relative change", () => {
  it("is current minus previous, over the previous value, with a sign", () => {
    assert.equal(relativeChange(120, 100), 0.2)
    assert.equal(relativeChange(80, 100), -0.2)
    assert.equal(formatChange(0.2), "+20.0%")
    assert.equal(formatChange(-0.2), "-20.0%")
  })

  it("is null when the previous value is zero or missing", () => {
    assert.equal(relativeChange(10, 0), null)
    assert.equal(relativeChange(10, null), null)
    assert.equal(relativeChange(null, 10), null)
    assert.equal(formatChange(null), "—")
  })
})
