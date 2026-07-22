import assert from "node:assert/strict"
import test from "node:test"

import {
  forecastLoadResultDisposition,
  shouldAutoReloadForecast,
} from "../loadForecastGuards.js"

test("forecastLoadResultDisposition applies only the current non-aborted request", () => {
  assert.equal(
    forecastLoadResultDisposition({ requestSeq: 2, currentSeq: 2, aborted: false }),
    "apply"
  )
})

test("forecastLoadResultDisposition ignores superseded sequence", () => {
  assert.equal(
    forecastLoadResultDisposition({ requestSeq: 1, currentSeq: 2, aborted: false }),
    "ignore_superseded"
  )
})

test("forecastLoadResultDisposition ignores aborted in-flight request", () => {
  assert.equal(
    forecastLoadResultDisposition({ requestSeq: 3, currentSeq: 3, aborted: true }),
    "ignore_superseded"
  )
})

test("shouldAutoReloadForecast gates scenario/FY auto-reload until first success", () => {
  assert.equal(shouldAutoReloadForecast(false), false)
  assert.equal(shouldAutoReloadForecast(true), true)
})
