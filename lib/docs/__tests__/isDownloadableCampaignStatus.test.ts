import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isApprovedOrBeyond,
  isDownloadableCampaignStatus,
} from "../isApprovedOrBeyond"
import { shouldSkipDocsForCampaignStatus } from "../saveDocSteps"

describe("isDownloadableCampaignStatus", () => {
  it("draft is not downloadable and docs are skipped", () => {
    assert.equal(isDownloadableCampaignStatus("draft"), false)
    assert.equal(isDownloadableCampaignStatus("Draft"), false)
    assert.equal(shouldSkipDocsForCampaignStatus("draft"), true)
  })

  it("planned is downloadable and docs are NOT skipped", () => {
    assert.equal(isDownloadableCampaignStatus("planned"), true)
    assert.equal(isDownloadableCampaignStatus("Planned"), true)
    assert.equal(shouldSkipDocsForCampaignStatus("planned"), false)
  })

  it("approved is downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("approved"), true)
    assert.equal(isDownloadableCampaignStatus("Approved"), true)
  })

  it("booked is downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("booked"), true)
  })

  it("completed is downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("completed"), true)
  })

  it("cancelled is downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("cancelled"), true)
  })

  it("empty / null is not downloadable", () => {
    assert.equal(isDownloadableCampaignStatus(""), false)
    assert.equal(isDownloadableCampaignStatus(null), false)
    assert.equal(isDownloadableCampaignStatus(undefined), false)
    assert.equal(shouldSkipDocsForCampaignStatus(""), true)
    assert.equal(shouldSkipDocsForCampaignStatus(null), true)
  })

  it("isApprovedOrBeyond(planned) is still false", () => {
    assert.equal(isApprovedOrBeyond("planned"), false)
    assert.equal(isApprovedOrBeyond("Planned"), false)
  })
})
