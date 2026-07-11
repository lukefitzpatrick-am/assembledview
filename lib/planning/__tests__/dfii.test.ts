import assert from "node:assert/strict"
import test from "node:test"
import { dfii, dfiiTone } from "../dfii.js"

test("uniform BCS scores → all DFII 100", () => {
  const out = dfii([{ bcs: 60 }, { bcs: 60 }, { bcs: 60 }])
  assert.deepEqual(out, [100, 100, 100])
})

test("one dominant channel → DFII >100 with others <100", () => {
  const out = dfii([{ bcs: 90 }, { bcs: 45 }, { bcs: 45 }])
  // mean = 60 → 150, 75, 75
  assert.deepEqual(out, [150, 75, 75])
  assert.ok((out[0] ?? 0) > 100)
  assert.ok((out[1] ?? 0) < 100)
  assert.ok((out[2] ?? 0) < 100)
})

test("excluded channels are omitted from the mean", () => {
  // If the weak channel were included, mean would be 50 → DFII 160 / 40.
  // Excluded from mean: mean = 80 → DFII 100 / 25 (excluded still scored).
  const out = dfii([
    { bcs: 80, includeInMean: true },
    { bcs: 20, includeInMean: false },
  ])
  assert.deepEqual(out, [100, 25])
})

test("mean 0 → all null", () => {
  assert.deepEqual(dfii([{ bcs: 0 }, { bcs: 0 }]), [null, null])
  assert.deepEqual(dfii([]), [])
})

test("null / non-finite BCS → null DFII; skipped in mean", () => {
  const out = dfii([{ bcs: null }, { bcs: 50 }, { bcs: Number.NaN }])
  assert.deepEqual(out, [null, 100, null])
})

test("dfiiTone bands around 100", () => {
  assert.equal(dfiiTone(120), "strong")
  assert.equal(dfiiTone(100), "neutral")
  assert.equal(dfiiTone(85), "neutral")
  assert.equal(dfiiTone(84), "weak")
  assert.equal(dfiiTone(null), null)
})
