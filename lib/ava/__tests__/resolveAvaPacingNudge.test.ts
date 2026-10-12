import assert from "node:assert/strict"
import test from "node:test"
import { resolveAvaPacingNudge } from "../resolveAvaPacingNudge.js"

test("resolveAvaPacingNudge: over-pacing at 115% of expected", () => {
  const nudge = resolveAvaPacingNudge(115)
  assert.equal(nudge?.kind, "over")
  assert.equal(nudge?.copy, "Over-pacing — burning budget faster than planned.")
})

test("resolveAvaPacingNudge: under-pacing below 90% of expected", () => {
  const nudge = resolveAvaPacingNudge(89.9)
  assert.equal(nudge?.kind, "under")
  assert.equal(nudge?.copy, "Under-delivering vs plan to date.")
})

test("resolveAvaPacingNudge: on-pace and the ahead band show nothing", () => {
  assert.equal(resolveAvaPacingNudge(114.9), null)
  assert.equal(resolveAvaPacingNudge(90), null)
  assert.equal(resolveAvaPacingNudge(100), null)
})

test("resolveAvaPacingNudge: non-finite returns null", () => {
  assert.equal(resolveAvaPacingNudge(NaN), null)
  assert.equal(resolveAvaPacingNudge(Infinity), null)
})
