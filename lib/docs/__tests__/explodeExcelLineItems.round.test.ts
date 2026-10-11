import assert from "node:assert/strict"
import test from "node:test"

import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"

test("explodeExcelLineItems rounds a recomputed CPM deliverable", () => {
  const [row] = explodeExcelLineItems(
    "digiDisplay",
    {
      lineItemId: "KRUSTY002DD001",
      buyType: "cpm",
      bursts: [{ budget: 10, buyAmount: 3, calculatedValue: 1 }],
    },
    0,
    0,
  )
  // (10 / 3) * 1000 = 3333.333… → 3333. Stored calculatedValue is not reused.
  assert.equal(row?.deliverables, 3333)
})
