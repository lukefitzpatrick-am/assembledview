import assert from "node:assert/strict"
import test from "node:test"

import { legacyMonthFeeFromNetMedia } from "../legacyMonthFeeEstimate"

test("a $10,000 net line at 20% fee is a $2,500 fee, not $2,000", () => {
  assert.equal(legacyMonthFeeFromNetMedia(10000, 20), 2500)
})

test("a zero media total or a zero fee rate estimates nothing", () => {
  assert.equal(legacyMonthFeeFromNetMedia(0, 20), 0)
  assert.equal(legacyMonthFeeFromNetMedia(10000, 0), 0)
})
