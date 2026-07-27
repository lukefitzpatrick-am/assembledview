import assert from "node:assert/strict"
import test from "node:test"

import { allCollapsedIndices } from "@/lib/mediaplan/collapsedLineItems"

test("allCollapsedIndices: empty for zero / negative", () => {
  assert.equal(allCollapsedIndices(0).size, 0)
  assert.equal(allCollapsedIndices(-3).size, 0)
})

test("allCollapsedIndices: collapses every index in range", () => {
  const set = allCollapsedIndices(5)
  assert.deepEqual([...set].sort((a, b) => a - b), [0, 1, 2, 3, 4])
})
