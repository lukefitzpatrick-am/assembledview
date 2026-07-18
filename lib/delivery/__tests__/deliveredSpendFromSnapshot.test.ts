import assert from "node:assert/strict"
import test from "node:test"

import { deliveredSpendFromSnapshot } from "../deliveredSpendFromSnapshot.js"

test("deliveredSpendFromSnapshot returns finite positive spend only", () => {
  assert.equal(deliveredSpendFromSnapshot(96_000), 96_000)
  assert.equal(deliveredSpendFromSnapshot(0.01), 0.01)
})

test("deliveredSpendFromSnapshot treats zero / missing / non-finite as unavailable", () => {
  assert.equal(deliveredSpendFromSnapshot(0), undefined)
  assert.equal(deliveredSpendFromSnapshot(-1), undefined)
  assert.equal(deliveredSpendFromSnapshot(NaN), undefined)
  assert.equal(deliveredSpendFromSnapshot(Infinity), undefined)
  assert.equal(deliveredSpendFromSnapshot(null), undefined)
  assert.equal(deliveredSpendFromSnapshot(undefined), undefined)
  assert.equal(deliveredSpendFromSnapshot("96000"), undefined)
})
