import assert from "node:assert/strict"
import test from "node:test"

import { statusFromExpectedPct } from "../status.js"

const cases: Array<[number, string]> = [
  [89.9, "behind"],
  [90, "on-track"],
  [110, "on-track"],
  [110.1, "ahead"],
  [114.9, "ahead"],
  [115, "over-pacing"],
]

test("percent of expected uses one band table", () => {
  for (const [pct, band] of cases) {
    assert.equal(statusFromExpectedPct(pct), band, String(pct))
  }
})
