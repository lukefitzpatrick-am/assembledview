import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CAMPAIGN_DATE_PRESETS,
  campaignDateRangeForPreset,
  defaultCampaignDateRange,
} from "@/lib/mediaplan/campaignDatePresets"

test("defaultCampaignDateRange is current calendar month", () => {
  const today = new Date(2026, 6, 14) // 14 Jul 2026
  const { start, end } = defaultCampaignDateRange(today)
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 6)
  assert.equal(start.getDate(), 1)
  assert.equal(end.getFullYear(), 2026)
  assert.equal(end.getMonth(), 6)
  assert.equal(end.getDate(), 31)
})

test("FY preset is Australian Jul–Jun containing today", () => {
  const beforeJul = new Date(2026, 2, 15) // Mar → FY25–26
  const fy = campaignDateRangeForPreset("fy", beforeJul)
  assert.equal(fy.start.getFullYear(), 2025)
  assert.equal(fy.start.getMonth(), 6)
  assert.equal(fy.start.getDate(), 1)
  assert.equal(fy.end.getFullYear(), 2026)
  assert.equal(fy.end.getMonth(), 5)
  assert.equal(fy.end.getDate(), 30)

  const afterJul = new Date(2026, 7, 1) // Aug → FY26–27
  const fy2 = campaignDateRangeForPreset("fy", afterJul)
  assert.equal(fy2.start.getFullYear(), 2026)
  assert.equal(fy2.end.getFullYear(), 2027)
})

test("this-quarter and 12-months presets span expected bounds", () => {
  const today = new Date(2026, 6, 14)
  const q = campaignDateRangeForPreset("this-quarter", today)
  assert.equal(q.start.getMonth(), 6)
  assert.equal(q.start.getDate(), 1)
  assert.equal(q.end.getMonth(), 8)
  assert.equal(q.end.getDate(), 30)

  const y = campaignDateRangeForPreset("12-months", today)
  assert.equal(y.start.getDate(), 14)
  assert.equal(y.end.getFullYear(), 2027)
  assert.equal(y.end.getMonth(), 6)
  assert.equal(y.end.getDate(), 14)
})

test("annual-plan is first of next month through end of month 12 months later", () => {
  const today = new Date(2026, 8, 2) // 2 Sep 2026
  const range = campaignDateRangeForPreset("annual-plan", today)
  assert.equal(range.start.getFullYear(), 2026)
  assert.equal(range.start.getMonth(), 9)
  assert.equal(range.start.getDate(), 1)
  assert.equal(range.end.getFullYear(), 2027)
  assert.equal(range.end.getMonth(), 8)
  assert.equal(range.end.getDate(), 30)
})

test("FY preset on 2 Sep 2026 is 1 Jul 2026 – 30 Jun 2027", () => {
  const fy = campaignDateRangeForPreset("fy", new Date(2026, 8, 2))
  assert.equal(fy.start.getFullYear(), 2026)
  assert.equal(fy.start.getMonth(), 6)
  assert.equal(fy.start.getDate(), 1)
  assert.equal(fy.end.getFullYear(), 2027)
  assert.equal(fy.end.getMonth(), 5)
  assert.equal(fy.end.getDate(), 30)
})

test("CAMPAIGN_DATE_PRESETS stays four entries without annual-plan", () => {
  assert.equal(CAMPAIGN_DATE_PRESETS.length, 4)
  assert.equal(
    CAMPAIGN_DATE_PRESETS.some((p) => p.id === "annual-plan"),
    false
  )
})
