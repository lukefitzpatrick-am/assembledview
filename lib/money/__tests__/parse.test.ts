import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseMoney } from "@/lib/money"

describe("parseMoney", () => {
  it("keeps the sign and strips currency decoration", () => {
    assert.equal(parseMoney("$1,200.50"), 1200.5)
    assert.equal(parseMoney("-1,200"), -1200)
    assert.equal(parseMoney("(1,200.00)"), -1200)
    assert.equal(parseMoney("1200"), 1200)
    assert.equal(parseMoney(1200), 1200)
    assert.equal(parseMoney(" AUD 5 "), 5)
  })

  it("returns null for empty, dash and non-finite input", () => {
    assert.equal(parseMoney(""), null)
    assert.equal(parseMoney("-"), null)
    assert.equal(parseMoney("abc"), null)
    assert.equal(parseMoney(Number.NaN), null)
    assert.equal(parseMoney(Number.POSITIVE_INFINITY), null)
    assert.equal(parseMoney(null), null)
  })
})
