import assert from "node:assert/strict"
import test from "node:test"

import {
  clampIsoDateOnly,
  computeEffectiveDateRange,
  isUnfilteredCampaignRange,
  isoToYearMonth,
  parseIsoDateOnlyStrict,
} from "../campaignDateRange"

const CAMPAIGN = { start: "2026-01-01", end: "2026-12-31" }

test("parseIsoDateOnlyStrict accepts yyyy-mm-dd and rejects invalid", () => {
  assert.equal(parseIsoDateOnlyStrict("2026-03-15"), "2026-03-15")
  assert.equal(parseIsoDateOnlyStrict(null), null)
  assert.equal(parseIsoDateOnlyStrict(""), null)
  assert.equal(parseIsoDateOnlyStrict("15/03/2026"), null)
  assert.equal(parseIsoDateOnlyStrict("2026-13-01"), null)
  assert.equal(parseIsoDateOnlyStrict("2026-02-31"), null)
  assert.equal(parseIsoDateOnlyStrict("not-a-date"), null)
})

test("clampIsoDateOnly pins values outside campaign bounds", () => {
  assert.equal(clampIsoDateOnly("2025-06-01", CAMPAIGN.start, CAMPAIGN.end), CAMPAIGN.start)
  assert.equal(clampIsoDateOnly("2027-06-01", CAMPAIGN.start, CAMPAIGN.end), CAMPAIGN.end)
  assert.equal(clampIsoDateOnly("2026-06-15", CAMPAIGN.start, CAMPAIGN.end), "2026-06-15")
  assert.equal(clampIsoDateOnly(null, CAMPAIGN.start, CAMPAIGN.end), null)
})

test("computeEffectiveDateRange clamps, fills missing sides, and swaps inverted ranges", () => {
  assert.deepEqual(
    computeEffectiveDateRange({
      campaignStartISO: CAMPAIGN.start,
      campaignEndISO: CAMPAIGN.end,
      requestedStartISO: null,
      requestedEndISO: null,
    }),
    { startISO: CAMPAIGN.start, endISO: CAMPAIGN.end },
  )

  assert.deepEqual(
    computeEffectiveDateRange({
      campaignStartISO: CAMPAIGN.start,
      campaignEndISO: CAMPAIGN.end,
      requestedStartISO: "2025-01-01",
      requestedEndISO: "2027-12-31",
    }),
    { startISO: CAMPAIGN.start, endISO: CAMPAIGN.end },
  )

  assert.deepEqual(
    computeEffectiveDateRange({
      campaignStartISO: CAMPAIGN.start,
      campaignEndISO: CAMPAIGN.end,
      requestedStartISO: "2026-06-01",
      requestedEndISO: "2026-03-01",
    }),
    { startISO: "2026-03-01", endISO: "2026-06-01" },
  )
})

test("isUnfilteredCampaignRange is true with no params or a window that equals the campaign", () => {
  assert.equal(
    isUnfilteredCampaignRange(null, null, CAMPAIGN.start, CAMPAIGN.end),
    true,
  )
  assert.equal(
    isUnfilteredCampaignRange(CAMPAIGN.start, CAMPAIGN.end, CAMPAIGN.start, CAMPAIGN.end),
    true,
  )
  assert.equal(
    isUnfilteredCampaignRange("2025-01-01", "2027-12-31", CAMPAIGN.start, CAMPAIGN.end),
    true,
  )
  assert.equal(
    isUnfilteredCampaignRange("2026-03-01", "2026-03-31", CAMPAIGN.start, CAMPAIGN.end),
    false,
  )
})

test("isoToYearMonth maps a valid day to YYYY-MM", () => {
  assert.equal(isoToYearMonth("2026-03-15"), "2026-03")
  assert.equal(isoToYearMonth("2026-02-31"), null)
})
