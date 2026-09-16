import assert from "node:assert/strict"
import test from "node:test"

import { suggestedMbaFromCampaignName } from "../suggestedMbaFromCampaignName.js"

test("bic- campaign prefix suggests BICAU", () => {
  assert.equal(
    suggestedMbaFromCampaignName("bic-flex5_fy27-twitch-progvideo-1920x1080--flex5_15sec"),
    "BICAU",
  )
})

test("sinch- campaign prefix suggests SINCH", () => {
  assert.equal(suggestedMbaFromCampaignName("sinch-always-on-fy27"), "SINCH")
})

test("prefix match is case-insensitive", () => {
  assert.equal(suggestedMbaFromCampaignName("BIC-Flex5"), "BICAU")
  assert.equal(suggestedMbaFromCampaignName("Sinch-Brand"), "SINCH")
})

test("campaign without a known client prefix has no suggested MBA", () => {
  assert.equal(suggestedMbaFromCampaignName("flex5_fy27-twitch-progvideo"), null)
  assert.equal(suggestedMbaFromCampaignName("golf-always-on"), null)
  assert.equal(suggestedMbaFromCampaignName(""), null)
  assert.equal(suggestedMbaFromCampaignName(null), null)
})
