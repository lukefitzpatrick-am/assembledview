/**
 * M1: the search, social and programmatic line cards rate expected net media
 * with the `one_net_media` value their builder passes (buildCampaignDetail
 * reads it once on the server). 10.50 at 7% is the cent-edge pair.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { lineCardFromProgrammatic, lineCardFromSearch, lineCardFromSocial } from "@/lib/pacing/channel/lineCardModel"
import { programmaticFixture, searchFixture, socialFixture } from "@/lib/pacing/channel/__tests__/fixtures"

const bursts = [{ index: 0, startDate: "2026-09-01", endDate: "2026-09-30", budget: 10.5, buyAmount: 1, calculatedValue: 10 }]
const AS_OF = "2026-09-30"

test("each line card's expected net follows the passed one_net_media value", () => {
  const cards = (on: boolean) => [
    lineCardFromSearch(searchFixture({ bursts, budgetIncludesFees: true }), AS_OF, 7, on),
    lineCardFromSocial(socialFixture({ bursts, budgetIncludesFees: true }), AS_OF, 7, on),
    lineCardFromProgrammatic(programmaticFixture({ bursts, budgetIncludesFees: true }), AS_OF, 7, on),
  ]
  assert.deepEqual(cards(true).map((c) => c.expectedToDate), [9.765, 9.765, 9.765])
  assert.deepEqual(cards(false).map((c) => c.expectedToDate), [9.764999999999999, 9.764999999999999, 9.764999999999999])
})
