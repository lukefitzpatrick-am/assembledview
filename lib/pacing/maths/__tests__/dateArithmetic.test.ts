import assert from "node:assert/strict"
import test from "node:test"
import { div0 } from "../div0.js"
import {
  computeCampaignDays,
  computeDaysPassed,
  computeDaysRemaining,
  getAsOfDate,
} from "../index.js"

test("future campaign: daysPassed 0, daysRemaining equals campaignDays", () => {
  const start = "2026-06-01"
  const end = "2026-06-30"
  const asOf = "2026-05-15"
  assert.equal(computeCampaignDays(start, end), 30)
  assert.equal(computeDaysPassed(start, end, asOf), 0)
  assert.equal(computeDaysRemaining(start, end, asOf), 30)
})

test("active campaign mid-flight (non-leap year)", () => {
  const start = "2026-01-01"
  const end = "2026-12-31"
  const asOf = "2026-07-01"
  assert.equal(computeCampaignDays(start, end), 365)
  assert.equal(computeDaysPassed(start, end, asOf), 182)
  assert.equal(computeDaysRemaining(start, end, asOf), 183)
})

test("active campaign mid-flight (leap year)", () => {
  const start = "2024-01-01"
  const end = "2024-12-31"
  const asOf = "2024-07-01"
  assert.equal(computeCampaignDays(start, end), 366)
  assert.equal(computeDaysPassed(start, end, asOf), 183)
  assert.equal(computeDaysRemaining(start, end, asOf), 183)
})

test("completed campaign: daysPassed equals campaignDays, daysRemaining 0", () => {
  const start = "2025-01-01"
  const end = "2025-12-31"
  const asOf = "2026-05-15"
  assert.equal(computeCampaignDays(start, end), 365)
  assert.equal(computeDaysPassed(start, end, asOf), 365)
  assert.equal(computeDaysRemaining(start, end, asOf), 0)
})

test("single-day campaign on that day", () => {
  const start = "2026-05-15"
  const end = "2026-05-15"
  const asOf = "2026-05-15"
  assert.equal(computeCampaignDays(start, end), 1)
  assert.equal(computeDaysPassed(start, end, asOf), 1)
  assert.equal(computeDaysRemaining(start, end, asOf), 0)
})

test("div0 matches Snowflake DIV0", () => {
  assert.equal(div0(10, 0), 0)
  assert.equal(div0(10, 2), 5)
  assert.equal(div0(0, 0), 0)
  assert.equal(div0(10, Number.NaN), 0)
})

test("getAsOfDate returns YYYY-MM-DD", () => {
  const s = getAsOfDate(new Date("2026-05-14T12:00:00.000Z"))
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/)
})
