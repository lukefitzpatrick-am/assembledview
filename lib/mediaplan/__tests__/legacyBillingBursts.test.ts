import assert from "node:assert/strict"
import test from "node:test"

import {
  getInfluencersBursts,
  getIntegrationBursts,
  getMagazinesBursts,
  getSocialMediaBursts,
} from "@/lib/mediaplan/legacyBillingBursts"

/**
 * W5c F3: the legacy billing shapes keep the old budget parser (strip to
 * digits and dots), which is what keeps billing byte-identical after the
 * Social, Influencers and Integration moves. A parseMoney-style parse reads
 * "-500" as -500 and "5000." as nothing.
 */
const START = new Date(2026, 0, 5)
const END = new Date(2026, 0, 31)

function formWith(budgets: string[]) {
  const lineItems = [
    {
      buyType: "cpm",
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      bursts: budgets.map((budget) => ({ budget, startDate: START, endDate: END })),
    },
  ]
  return { getValues: (name: string) => (name === "lineItems" ? lineItems : undefined) }
}

const SHAPES = [
  ["social", getSocialMediaBursts],
  ["influencers", getInfluencersBursts],
  ["integration", getIntegrationBursts],
] as const

for (const [name, bursts] of SHAPES) {
  test(`${name} legacy billing reads budgets with the strip parser`, () => {
    const out = bursts(formWith(["-500", "5000.", "$1,000.00", ".5", "abc", ""]) as never, 10)
    assert.deepEqual(
      out.map((b) => b.mediaAmount),
      [500, 5000, 1000, 0.5, 0, 0],
    )
  })
}

test("magazines legacy billing keeps a typed bonus count as saved, and the line's No Ad Serving box (W5j)", () => {
  const lineItems = [
    {
      buyType: "bonus",
      noadserving: true,
      bursts: [{ budget: "0", calculatedValue: "5", startDate: START, endDate: END }],
    },
  ]
  const [out] = getMagazinesBursts({ getValues: () => lineItems } as never, 10)
  assert.equal(out.mediaType, "magazines")
  assert.equal(out.deliverables, "5")
  assert.equal(out.noAdserving, true)
  assert.equal("lineItemId" in out, false)
})
