import assert from "node:assert/strict"
import test from "node:test"

import { allCollapsedIndices } from "@/lib/mediaplan/collapsedLineItems"
import { fingerprintMediaLineItems } from "@/lib/mediaplan/publishMediaLineItems"

/**
 * Collapse is display-only: the same line-item payload fingerprints identically
 * whether or not a collapsed-index set exists alongside it (collapse state is
 * never part of the published / saved payload).
 */
test("collapse state is orthogonal to media-line fingerprint (save parity)", () => {
  const lineItems = [
    {
      platform: "Meta Ads",
      buy_type: "cpm",
      bursts: [{ budget: "1000", buyAmount: "12.5", calculatedValue: 80000 }],
      line_item: 1,
    },
    {
      platform: "TikTok",
      buy_type: "cpc",
      bursts: [{ budget: "500", buyAmount: "2", calculatedValue: 250 }],
      line_item: 2,
    },
  ]

  const collapsed = allCollapsedIndices(lineItems.length)
  assert.equal(collapsed.size, 2)

  const fpA = fingerprintMediaLineItems(lineItems)
  const fpB = fingerprintMediaLineItems(lineItems)
  assert.equal(fpA, fpB)

  // Collapsed set must not be mixed into the publish payload.
  const published = lineItems.map((item) => ({ ...item }))
  assert.equal(fingerprintMediaLineItems(published), fpA)
})
