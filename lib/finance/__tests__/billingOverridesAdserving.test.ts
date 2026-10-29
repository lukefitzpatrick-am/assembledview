/**
 * An ad serving billing_overrides row is never read as a media override
 * (true-up, 29 Oct 2026). attachOverridesToLineInputs used to treat every
 * non-fee row as media.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { attachOverridesToLineInputs } from "../billingOverrides.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

const line: LineItemInput = {
  lineItemId: "x001DD1",
  mediaType: "digiDisplay",
  buyType: "cpm",
  rate: 10,
  enteredAmount: 6000,
  budgetIncludesFees: false,
  clientPaysForMedia: false,
  bursts: [{ startDate: "2026-09-01", endDate: "2026-11-30", budget: 6000, buyAmount: 10 }],
  approval: "approved",
}

test("ad serving rows are skipped; media and fee rows still attach", () => {
  const months = [{ month: "2026-09", amount: 0 }, { month: "2026-10", amount: 60 }, { month: "2026-11", amount: 60 }]
  const [onlyAd] = attachOverridesToLineInputs([line], [{ line_item_id: "x001DD1", component: "adserving", mode: "manual", months }])
  assert.equal(onlyAd!.billingOverride, undefined)
  assert.equal(onlyAd!.feeOverride, undefined)
  const [media] = attachOverridesToLineInputs([line], [{ line_item_id: "x001DD1", component: "media", mode: "manual", months }])
  assert.ok(media!.billingOverride)
})
