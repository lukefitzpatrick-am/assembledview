/**
 * AA Insertions "Spot or insertion rate" reads item.buyAmount on every
 * channel, so offline rows must carry it too (not only digital).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import type { MediaItems } from "@/lib/generateMediaPlan"

const cases: Array<{ key: keyof MediaItems; buyType: string; id: string }> = [
  { key: "radio", buyType: "spots", id: "TEST001RA1" },
  { key: "television", buyType: "cpt", id: "TEST001TV1" },
  { key: "ooh", buyType: "panels", id: "TEST001OH1" },
  { key: "cinema", buyType: "spots", id: "TEST001CI1" },
  { key: "newspaper", buyType: "insertions", id: "TEST001NP1" },
  { key: "magazines", buyType: "insertions", id: "TEST001MG1" },
  { key: "digiDisplay", buyType: "cpm", id: "TEST001DD1" },
]

for (const c of cases) {
  test(`${c.key} row carries the spot or insertion rate as buyAmount`, () => {
    const [row] = explodeExcelLineItems(
      c.key,
      {
        lineItemId: c.id,
        buyType: c.buyType,
        bursts: [{ budget: 5000, buyAmount: 250, calculatedValue: 20 }],
      },
      0,
      0,
    )
    assert.equal(row?.buyAmount, 250)
  })
}

test("offline buyAmount falls back to the burst budget, as digital does", () => {
  const [row] = explodeExcelLineItems(
    "radio",
    { lineItemId: "TEST001RA2", buyType: "package", bursts: [{ budget: 1200 }] },
    0,
    0,
  )
  assert.equal(row?.buyAmount, 1200)
})
