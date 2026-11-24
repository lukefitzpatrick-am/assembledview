/**
 * M1: assembleCampaignPacingRows passes its `one_net_media` input (read once
 * by buildCampaignPacingRows and buildCampaignDetail) to the direct digital
 * estimate. $6,422,837.50 at 42.84% is the one real cent move found in 30
 * million random pairs.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { p6AssembleInput } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

function spendToDate(oneNetMedia: boolean): number {
  const input = p6AssembleInput()
  const base = input.adServing[0]!
  const rows = assembleCampaignPacingRows({
    ...input,
    adServing: [
      {
        ...base,
        lineItemId: "BICAU002BV9",
        budgetIncludesFees: true,
        bursts: [{ budget: "$6,422,837.50", calculatedValue: 1000 }] as never,
        impressions: 2000,
        plannedImpressions: 1000,
        deliverableTarget: 1000,
      },
    ],
    feePctsByVersionId: { [String(base.mediaPlanVersionId)]: { "digital-display": 0, "digital-video": 0, "digital-audio": 0, bvod: 42.84 } },
    oneNetMedia,
  })
  const row = rows.find((r) => r.mbaNumber === "BICAU002")!
  return row.spendToDate
}

test("the portfolio estimate follows the passed one_net_media value", () => {
  assert.equal(Math.round((spendToDate(true) - spendToDate(false)) * 100), 1)
})
