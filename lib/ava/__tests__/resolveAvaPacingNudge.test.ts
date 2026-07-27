import assert from "node:assert/strict"
import test from "node:test"
import { resolveAvaPacingNudge } from "../resolveAvaPacingNudge.js"

test("resolveAvaPacingNudge: over-pacing above 115%", () => {
  const nudge = resolveAvaPacingNudge(115.1)
  assert.equal(nudge?.kind, "over")
  assert.equal(nudge?.copy, "Over-pacing — burning budget faster than planned.")
})

test("resolveAvaPacingNudge: under-pacing below 85%", () => {
  const nudge = resolveAvaPacingNudge(84.9)
  assert.equal(nudge?.kind, "under")
  assert.equal(nudge?.copy, "Under-delivering vs plan to date.")
})

test("resolveAvaPacingNudge: on-pace and boundaries show nothing", () => {
  assert.equal(resolveAvaPacingNudge(115), null)
  assert.equal(resolveAvaPacingNudge(85), null)
  assert.equal(resolveAvaPacingNudge(100), null)
})

test("resolveAvaPacingNudge: non-finite returns null", () => {
  assert.equal(resolveAvaPacingNudge(NaN), null)
  assert.equal(resolveAvaPacingNudge(Infinity), null)
})
