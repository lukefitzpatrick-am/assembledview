import assert from "node:assert/strict"
import test from "node:test"

import {
  isInMarketNow,
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

test("isInMarketNow requires booked/approved and active dates", () => {
  assert.equal(
    isInMarketNow(
      {
        campaign_status: "booked",
        campaign_start_date: "2026-01-01",
        campaign_end_date: "2026-12-31",
      },
      new Date("2026-07-31"),
    ),
    true,
  )
  assert.equal(
    isInMarketNow(
      {
        campaign_status: "booked",
        campaign_start_date: "2020-01-01",
        campaign_end_date: "2020-06-01",
      },
      new Date("2026-07-31"),
    ),
    false,
  )
})
