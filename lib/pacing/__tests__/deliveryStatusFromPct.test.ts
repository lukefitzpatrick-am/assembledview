import assert from "node:assert/strict"
import test from "node:test"

import {
  AHEAD_ABOVE_PCT,
  BEHIND_BELOW_PCT,
  deliveryStatusFromPct,
} from "../deliveryStatusFromPct.js"

test("exports 90 / 110 named thresholds", () => {
  assert.equal(BEHIND_BELOW_PCT, 90)
  assert.equal(AHEAD_ABOVE_PCT, 110)
})

test("89.9 is behind", () => {
  assert.equal(deliveryStatusFromPct(89.9), "behind")
})

test("90 is on-track", () => {
  assert.equal(deliveryStatusFromPct(90), "on-track")
})

test("110 is on-track", () => {
  assert.equal(deliveryStatusFromPct(110), "on-track")
})

test("110.1 is ahead", () => {
  assert.equal(deliveryStatusFromPct(110.1), "ahead")
})

test("undefined is no-data", () => {
  assert.equal(deliveryStatusFromPct(undefined), "no-data")
})

test("NaN is no-data", () => {
  assert.equal(deliveryStatusFromPct(Number.NaN), "no-data")
})
