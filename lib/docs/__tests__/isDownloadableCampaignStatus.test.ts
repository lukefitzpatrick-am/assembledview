import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isApprovedOrBeyond,
  isDownloadableCampaignStatus,
} from "../isApprovedOrBeyond"

describe("isDownloadableCampaignStatus", () => {
  it("draft is not downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("draft"), false)
    assert.equal(isDownloadableCampaignStatus("Draft"), false)
  })

  it("planned is downloadable", () => {
    assert.equal(isDownloadableCampaignStatus("planned"), true)
    assert.equal(isDownloadableCampaignStatus("Planned"), true)
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
  })

  it("isApprovedOrBeyond(planned) is still false", () => {
    assert.equal(isApprovedOrBeyond("planned"), false)
    assert.equal(isApprovedOrBeyond("Planned"), false)
  })
})
