import assert from "node:assert/strict"
import { test } from "node:test"

import {
  formatMinutesAsEstimate,
  parseEstimateToMinutes,
} from "../estimateParse.js"

test("parseEstimateToMinutes accepts 1h 30m / 45m / 2h", () => {
  assert.equal(parseEstimateToMinutes("1h 30m"), 90)
  assert.equal(parseEstimateToMinutes("45m"), 45)
  assert.equal(parseEstimateToMinutes("2h"), 120)
  assert.equal(parseEstimateToMinutes("~2h"), 120)
  assert.equal(parseEstimateToMinutes("~45m"), 45)
  assert.equal(parseEstimateToMinutes("1h30m"), 90)
})

test("formatMinutesAsEstimate humanises minutes", () => {
  assert.equal(formatMinutesAsEstimate(90), "1h 30m")
  assert.equal(formatMinutesAsEstimate(45), "45m")
  assert.equal(formatMinutesAsEstimate(120), "2h")
  assert.equal(formatMinutesAsEstimate(0), null)
  assert.equal(formatMinutesAsEstimate(null), null)
})

test("unrecognised estimate text is null, not zero", () => {
  assert.equal(parseEstimateToMinutes(""), null)
  assert.equal(parseEstimateToMinutes("soon"), null)
  assert.equal(parseEstimateToMinutes("~foo"), null)
})
