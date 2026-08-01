import assert from "node:assert/strict"
import test from "node:test"

import {
  isScheduleEnded,
  normalizeStoredCampaignStatus,
} from "../campaignListStatus.js"

test("past end date + stored booked stays Booked (never invented Completed)", () => {
  const status = normalizeStoredCampaignStatus("booked")
  assert.equal(status, "Booked")
  assert.equal(isScheduleEnded("2020-01-01", new Date("2026-07-31")), true)
  // Display path: scheduleEnded is a separate hint; campaign_status stays Booked.
  const displayStatus = status
  const scheduleEndedHint = isScheduleEnded("2020-01-01", new Date("2026-07-31"))
  assert.equal(displayStatus, "Booked")
  assert.equal(scheduleEndedHint, true)
  assert.notEqual(displayStatus, "Completed")
})

test("normalizeStoredCampaignStatus title-cases known values only", () => {
  assert.equal(normalizeStoredCampaignStatus("APPROVED"), "Approved")
  assert.equal(normalizeStoredCampaignStatus("completed"), "Completed")
  assert.equal(normalizeStoredCampaignStatus(""), "Draft")
})
