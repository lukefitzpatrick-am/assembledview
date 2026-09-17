import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  campaignDetailPath,
  readCampaignMbaFromSearch,
  withCampaignMba,
  withoutCampaignMba,
} from "../campaignDetailUrl.js"

describe("campaignDetailUrl", () => {
  it("reads, adds and removes ?campaign=", () => {
    assert.equal(readCampaignMbaFromSearch("?asOfDate=2026-09-16&campaign=jayco001"), "jayco001")
    assert.equal(withCampaignMba("?asOfDate=2026-09-16", "jayco001"), "?asOfDate=2026-09-16&campaign=jayco001")
    assert.equal(withoutCampaignMba("?campaign=jayco001&asOfDate=2026-09-16"), "?asOfDate=2026-09-16")
    assert.equal(
      campaignDetailPath("/pacing/portfolio", "?asOfDate=2026-09-16", "jayco001"),
      "/pacing/portfolio?asOfDate=2026-09-16&campaign=jayco001",
    )
    assert.equal(campaignDetailPath("/pacing/portfolio", "?campaign=jayco001", null), "/pacing/portfolio")
  })
})
