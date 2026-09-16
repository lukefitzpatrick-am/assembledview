import assert from "node:assert/strict"
import test from "node:test"

import { inclusiveCampaignDayMetrics } from "../melbourne.js"

test("Sep 16 of a 1 Aug–25 Oct campaign is Day 47 of 86 (Melbourne calendar)", () => {
  const m = inclusiveCampaignDayMetrics("2026-08-01", "2026-10-25", "2026-09-16")
  assert.equal(m.daysInCampaign, 86)
  assert.equal(m.daysElapsed, 47)
  assert.equal(m.daysRemaining, 39)
})

test("Sep 16 of a 1 Sep–30 Nov campaign is Day 16 of 91 (Melbourne calendar)", () => {
  const m = inclusiveCampaignDayMetrics("2026-09-01", "2026-11-30", "2026-09-16")
  assert.equal(m.daysInCampaign, 91)
  assert.equal(m.daysElapsed, 16)
  assert.equal(m.daysRemaining, 75)
})

test("campaign start date is Day 1, not Day 0 or Day 2", () => {
  const m = inclusiveCampaignDayMetrics("2026-09-01", "2026-11-30", "2026-09-01")
  assert.equal(m.daysElapsed, 1)
  assert.equal(m.daysRemaining, 90)
})

test("before the start date elapsed is 0; after the end date elapsed caps at duration", () => {
  const before = inclusiveCampaignDayMetrics("2026-09-01", "2026-11-30", "2026-08-31")
  assert.equal(before.daysElapsed, 0)
  assert.equal(before.daysRemaining, 91)

  const after = inclusiveCampaignDayMetrics("2026-09-01", "2026-11-30", "2026-12-01")
  assert.equal(after.daysElapsed, 91)
  assert.equal(after.daysRemaining, 0)
})
