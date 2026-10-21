import assert from "node:assert/strict"
import test from "node:test"

import { aggregateSocialForLineItem, type SocialFactRow } from "@/lib/pacing/social/aggregate"
import {
  aggregateProgrammaticForLineItem,
  type ProgrammaticFactRow,
} from "@/lib/pacing/programmatic/aggregate"
import type { DateWindows } from "@/lib/pacing/campaigns/aggregate"

const windows: DateWindows = {
  lineTotalStart: "2026-10-01",
  lineTotalEnd: "2026-10-20",
  currentBurstStart: "2026-10-01",
  currentBurstEnd: "2026-10-20",
  yesterday: "2026-10-20",
}

function fact(overrides: Partial<SocialFactRow> = {}) {
  return {
    CHANNEL: "Social - Meta",
    DATE_DAY: "2026-10-05",
    LINE_ITEM_ID: "hartm001sm3",
    ENTITY_NAME: "ad set",
    ENTITY_ID: "a1",
    CAMPAIGN_NAME: "c1",
    AMOUNT_SPENT: 100,
    IMPRESSIONS: 254_343,
    CLICKS: 1_449,
    RESULTS: 124,
    VIDEO_3S_VIEWS: 0,
    MAX_FIVETRAN_SYNCED_AT: null,
    UPDATED_AT: null,
    ...overrides,
  }
}

test("social pacing conversion rate is results over clicks", () => {
  const row = { ...fact(), socialPlatform: "meta" } as SocialFactRow
  const { metrics } = aggregateSocialForLineItem([row], windows, "IMPRESSIONS")
  assert.equal(metrics.conversionRate, 124 / 1_449)
})

test("social pacing conversion rate is null with no clicks", () => {
  const row = { ...fact({ CLICKS: 0 }), socialPlatform: "meta" } as SocialFactRow
  const { metrics } = aggregateSocialForLineItem([row], windows, "IMPRESSIONS")
  assert.equal(metrics.conversionRate, null)
})

test("programmatic pacing conversion rate is results over clicks", () => {
  const row = {
    ...fact({ CHANNEL: "Programmatic - DV360", RESULTS: 5, CLICKS: 20, IMPRESSIONS: 8_000 }),
    snowflakeChannel: "programmatic-display",
  } as unknown as ProgrammaticFactRow
  const { metrics } = aggregateProgrammaticForLineItem([row], windows, "IMPRESSIONS")
  assert.equal(metrics.conversionRate, 0.25)
})
