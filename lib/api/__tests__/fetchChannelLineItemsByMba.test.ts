/**
 * Regression: channel GETs must hydrate Search bursts for both
 * - skewed plans (first published version_number = 2, mp_plannumber = "1") like krusty010/011
 * - aligned plans (version_number = 1) like krusty002
 *
 * Root cause C: mba_number + version_number / media_plan_version=<number> queries miss
 * when the client sends a version *number* that Xano treats as an FK id.
 */

import assert from "node:assert/strict"
import { test } from "node:test"

const {
  CHANNEL_LINE_ITEM_ENDPOINTS,
  filterByMbaAndVersion,
  isChannelLineItemEndpoint,
  resolveChannelLineItemEndpoint,
} = await import("../fetchChannelLineItemsByMba.js")

/** krusty010/011-shaped Search child: published vn=2, mp_plannumber "1", real FK id. */
const SKEWED_SEARCH_BURST = {
  id: 9001,
  mba_number: "krusty010",
  line_item_id: "SEARCH-1",
  line_item_number: 1,
  version_number: 2,
  mp_plannumber: "1",
  media_plan_version: 1049,
  bursts_json: [
    {
      budget: 10000,
      start_date: "2026-07-01",
      end_date: "2026-07-31",
    },
  ],
  total_budget: 10000,
}

/** krusty002-shaped Search child: aligned first version. */
const ALIGNED_SEARCH_BURST = {
  id: 8001,
  mba_number: "krusty002",
  line_item_id: "SEARCH-1",
  line_item_number: 1,
  version_number: 1,
  mp_plannumber: "1",
  media_plan_version: 900,
  bursts_json: [
    {
      budget: 5000,
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    },
  ],
  total_budget: 5000,
}

test("CHANNEL_LINE_ITEM_ENDPOINTS covers all 20 channel tables", () => {
  assert.equal(CHANNEL_LINE_ITEM_ENDPOINTS.length, 20)
  assert.equal(isChannelLineItemEndpoint("media_plan_search"), true)
  assert.equal(isChannelLineItemEndpoint("media_plan_radio"), true)
  assert.equal(isChannelLineItemEndpoint("search"), false)
  assert.equal(resolveChannelLineItemEndpoint("search"), "media_plan_search")
  assert.equal(resolveChannelLineItemEndpoint("media_plan_radio"), "media_plan_radio")
  assert.equal(resolveChannelLineItemEndpoint("radio"), "media_plan_radio")
  assert.equal(resolveChannelLineItemEndpoint("not-a-channel"), null)
})

test("filterByMbaAndVersion: skewed plan matches by FK id (not mp_plannumber)", () => {
  const filtered = filterByMbaAndVersion([SKEWED_SEARCH_BURST], "krusty010", 2, 1049)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].total_budget, 10000)
  assert.equal(filtered[0].bursts_json[0].budget, 10000)
})

test("filterByMbaAndVersion: skewed plan with wrong FK id is excluded", () => {
  const filtered = filterByMbaAndVersion([SKEWED_SEARCH_BURST], "krusty010", 2, 9999)
  assert.equal(filtered.length, 0)
})

test("filterByMbaAndVersion: skewed plan without FK hint still matches version_number=2", () => {
  // Legacy path when version row id is unknown — version_number field wins over mp_plannumber
  // only when both are checked equally; row has version_number=2 so vn=2 matches.
  const filtered = filterByMbaAndVersion([SKEWED_SEARCH_BURST], "krusty010", 2, null)
  assert.equal(filtered.length, 1)
})

test("filterByMbaAndVersion: aligned plan matches version 1 via FK", () => {
  const filtered = filterByMbaAndVersion([ALIGNED_SEARCH_BURST], "krusty002", 1, 900)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].total_budget, 5000)
})

test("filterByMbaAndVersion: aligned plan matches version 1 without FK (mp_plannumber / vn)", () => {
  const filtered = filterByMbaAndVersion([ALIGNED_SEARCH_BURST], "krusty002", 1, null)
  assert.equal(filtered.length, 1)
})

