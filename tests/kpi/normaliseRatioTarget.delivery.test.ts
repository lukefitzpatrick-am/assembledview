import assert from "node:assert/strict"
import test from "node:test"
import { normaliseRatioTarget } from "../../lib/kpi/normaliseRatioTarget.js"
import { storedDecimalToPercentPoints } from "../../lib/kpi/percentUnits.js"

/** Mirrors delivery adapter conversion: stored decimal → 0–100 percentage points. */
function ratioTargetPercentPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || raw <= 0) return undefined
  return storedDecimalToPercentPoints(normaliseRatioTarget(raw))
}

test("decimal ratio 0.03 → 3 percentage points", () => {
  assert.equal(ratioTargetPercentPoints(0.03), 3)
})

test("stored 1.0 (100%) → 100 percentage points (AV-25 v2; not 1%)", () => {
  assert.equal(ratioTargetPercentPoints(1), 100)
})

test("legacy percentage-point 3 is NOT auto-/100 (migration pending)", () => {
  // Until dual-store migration, a leftover `3` reads as 300% — intentional.
  assert.equal(ratioTargetPercentPoints(3), 300)
})

test("zero and null produce no delivery target", () => {
  assert.equal(ratioTargetPercentPoints(0), undefined)
  assert.equal(ratioTargetPercentPoints(null), undefined)
})
