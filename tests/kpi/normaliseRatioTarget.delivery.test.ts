import assert from "node:assert/strict"
import test from "node:test"
import { normaliseRatioTarget } from "../../lib/kpi/normaliseRatioTarget.js"

/** Mirrors delivery adapter conversion: ratio target → 0–100 percentage points. */
function ratioTargetPercentPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || raw <= 0) return undefined
  return normaliseRatioTarget(raw) * 100
}

test("decimal ratio 0.03 → 3 percentage points", () => {
  assert.equal(ratioTargetPercentPoints(0.03), 3)
})

test("legacy percentage-point input 3 → 3 percentage points", () => {
  assert.equal(ratioTargetPercentPoints(3), 3)
})

test("zero and null produce no delivery target", () => {
  assert.equal(ratioTargetPercentPoints(0), undefined)
  assert.equal(ratioTargetPercentPoints(null), undefined)
})
