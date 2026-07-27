import assert from "node:assert/strict"
import test from "node:test"

import { nextMbaVersionNumber } from "@/lib/mediaplan/nextMbaVersionNumber"

test("nextMbaVersionNumber: empty version table → v1 (create quirk)", () => {
  // Master may already say version_number=1; with zero rows we still cut v1.
  assert.equal(nextMbaVersionNumber(0, 1), 1)
  assert.equal(nextMbaVersionNumber(0, 0), 1)
})

test("nextMbaVersionNumber: create→publish→edit increments v1→v2", () => {
  assert.equal(nextMbaVersionNumber(1, 1), 2)
  assert.equal(nextMbaVersionNumber(2, 2), 3)
})

test("nextMbaVersionNumber: legacy vn=2 plans keep incrementing (no renumber)", () => {
  // krusty012-shaped: two version rows, published watermark 2 → next is 3, not reset to 1.
  assert.equal(nextMbaVersionNumber(2, 2), 3)
  assert.equal(nextMbaVersionNumber(5, 5), 6)
})
