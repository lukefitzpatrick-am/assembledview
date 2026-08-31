/**
 * CS-B — selectable vs persisted campaign-status vocabulary.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PERSISTED_CAMPAIGN_STATUSES,
  SELECTABLE_CAMPAIGN_STATUSES,
  getDraftReturnRejection,
  isSelectableCampaignStatus,
  mapCampaignStatusForPersist,
} from "@/lib/mediaplan/campaignStatusGuard"

describe("SELECTABLE_CAMPAIGN_STATUSES", () => {
  it("is planned, approved, booked, cancelled — in that order", () => {
    assert.deepEqual([...SELECTABLE_CAMPAIGN_STATUSES], [
      "planned",
      "approved",
      "booked",
      "cancelled",
    ])
  })

  it("does not include legacy draft or completed", () => {
    assert.equal(SELECTABLE_CAMPAIGN_STATUSES.includes("draft" as never), false)
    assert.equal(
      SELECTABLE_CAMPAIGN_STATUSES.includes("completed" as never),
      false
    )
  })

  it("is a subset of PERSISTED_CAMPAIGN_STATUSES", () => {
    const persisted = new Set<string>(PERSISTED_CAMPAIGN_STATUSES)
    for (const status of SELECTABLE_CAMPAIGN_STATUSES) {
      assert.ok(persisted.has(status), status)
    }
  })
})

describe("isSelectableCampaignStatus", () => {
  it("accepts selectable values case-insensitively", () => {
    assert.equal(isSelectableCampaignStatus("planned"), true)
    assert.equal(isSelectableCampaignStatus("Approved"), true)
    assert.equal(isSelectableCampaignStatus("BOOKED"), true)
    assert.equal(isSelectableCampaignStatus("cancelled"), true)
  })

  it("rejects persisted-but-unselectable and unknown", () => {
    assert.equal(isSelectableCampaignStatus("draft"), false)
    assert.equal(isSelectableCampaignStatus("completed"), false)
    assert.equal(isSelectableCampaignStatus("live"), false)
    assert.equal(isSelectableCampaignStatus(""), false)
    assert.equal(isSelectableCampaignStatus(null), false)
  })
})

describe("PERSISTED still parseable for legacy rows", () => {
  it("mapCampaignStatusForPersist still maps draft and completed", () => {
    assert.equal(mapCampaignStatusForPersist("Draft"), "draft")
    assert.equal(mapCampaignStatusForPersist("completed"), "completed")
  })
})

describe("getDraftReturnRejection (kept until CS-D)", () => {
  it("rejects a return to draft from a selectable status", () => {
    const rejection = getDraftReturnRejection("booked", "draft")
    assert.ok(rejection)
    assert.equal(rejection!.status, 422)
  })
})
