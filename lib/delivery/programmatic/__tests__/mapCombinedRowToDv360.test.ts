import assert from "node:assert/strict"
import test from "node:test"

import type { PacingRow } from "@/lib/snowflake/pacing-service"
import { mapCombinedRowToDv360 } from "../programmaticCompute"

function pacingRow(overrides: Partial<PacingRow> = {}): PacingRow {
  return {
    channel: "programmatic-display",
    dateDay: "2026-03-01",
    adsetName: "adset",
    entityName: null,
    campaignId: null,
    campaignName: "io",
    adsetId: null,
    entityId: null,
    lineItemId: "TEST001PD1",
    amountSpent: 12.5,
    impressions: 1000,
    clicks: 4,
    results: 1,
    video3sViews: 8,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    ...overrides,
  }
}

test("mapCombinedRowToDv360 still throws on an unexpected channel", () => {
  const accepted = new Set(["programmatic-display", "programmatic-video"])
  assert.throws(
    () => mapCombinedRowToDv360(pacingRow({ channel: "meta" }), accepted),
    /Unexpected channel for programmatic pacing: meta/,
  )
})

test("mapCombinedRowToDv360 accepts ad-serving when that channel is in the accepted set", () => {
  const accepted = new Set(["ad-serving"])
  const mapped = mapCombinedRowToDv360(pacingRow({ channel: "ad-serving" }), accepted)
  assert.equal(mapped.date, "2026-03-01")
  assert.equal(mapped.spend, 12.5)
  assert.equal(mapped.impressions, 1000)
  assert.equal(mapped.clicks, 4)
  assert.equal(mapped.conversions, 1)
  assert.equal(mapped.videoViews, 8)
  assert.equal(mapped.matchedPostfix, "test001pd1")
})

test("mapCombinedRowToDv360 still throws on ad-serving when the accepted set is programmatic-only", () => {
  const accepted = new Set(["programmatic-display", "programmatic-video"])
  assert.throws(
    () => mapCombinedRowToDv360(pacingRow({ channel: "ad-serving" }), accepted),
    /Unexpected channel for programmatic pacing: ad-serving/,
  )
})
