/**
 * Regression: channel GETs must hydrate Search bursts for both
 * - skewed plans (first published version_number = 2, mp_plannumber = "1") like krusty010/011
 * - aligned plans (version_number = 1) like krusty002
 *
 * Root cause C: mba_number + version_number / media_plan_version=<number> queries miss
 * when the client sends a version *number* that Xano treats as an FK id.
 */

import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import axios from "axios"

process.env.XANO_MEDIA_PLANS_BASE_URL ||= "https://xano.test/api"
process.env.XANO_MEDIAPLANS_BASE_URL ||= "https://xano.test/api"

const mockGet = mock.fn(async (..._args: unknown[]): Promise<{ data: unknown }> => ({ data: [] }))
axios.get = mockGet as typeof axios.get

const {
  CHANNEL_LINE_ITEM_ENDPOINTS,
  filterByMbaAndVersion,
  fetchXanoTableForEndpoint,
  isChannelLineItemEndpoint,
} = await import("../fetchChannelLineItemsByMba.js")

beforeEach(() => {
  mockGet.mock.resetCalls()
  mockGet.mock.mockImplementation(async () => ({ data: [] }))
})

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

test("fetchXanoTableForEndpoint: FK-first recovers skewed Search when version_number query is empty", async () => {
  // Simulates Xano: media_plan_version=<version number 2> treated as FK id → [];
  // media_plan_version=<row id 1049> returns the July $10k burst.
  mockGet.mock.mockImplementation(async (url: unknown) => {
    const u = new URL(String(url))
    const fk = u.searchParams.get("media_plan_version")
    const vn = u.searchParams.get("version_number")
    const mp = u.searchParams.get("mp_plannumber")

    if (fk === "1049") {
      return { data: [SKEWED_SEARCH_BURST] }
    }
    // Client-style version *number* as media_plan_version → empty (Root Cause C)
    if (fk === "2") {
      return { data: [] }
    }
    if (vn === "2" || mp === "2") {
      return { data: [] }
    }
    return { data: [] }
  })

  const items = await fetchXanoTableForEndpoint(
    "media_plan_search",
    "krusty010",
    2,
    1049,
    "TEST_SKEWED"
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].total_budget, 10000)
  assert.equal(items[0].bursts_json[0].start_date, "2026-07-01")
  assert.equal(items[0].bursts_json[0].end_date, "2026-07-31")
})

test("fetchXanoTableForEndpoint: aligned plan still hydrates when FK id is used", async () => {
  mockGet.mock.mockImplementation(async (url: unknown) => {
    const u = new URL(String(url))
    const fk = u.searchParams.get("media_plan_version")
    if (fk === "900" || u.searchParams.get("version_number") === "1") {
      return { data: [ALIGNED_SEARCH_BURST] }
    }
    return { data: [] }
  })

  const items = await fetchXanoTableForEndpoint(
    "media_plan_search",
    "krusty002",
    1,
    900,
    "TEST_ALIGNED"
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].total_budget, 5000)
  assert.equal(items[0].bursts_json[0].budget, 5000)
})

test("fetchXanoTableForEndpoint: create→save→reopen single Search burst shape (budget + dates)", async () => {
  // Synthetic post-save reopen payload for a single-burst Search line.
  const savedBurst = {
    id: 7001,
    mba_number: "reopen-search-1",
    line_item_id: "SEARCH-1",
    line_item_number: 1,
    version_number: 1,
    mp_plannumber: "1",
    media_plan_version: 501,
    bursts_json: [
      {
        budget: 10000,
        start_date: "2026-07-01",
        end_date: "2026-07-31",
      },
    ],
    total_budget: 10000,
  }

  mockGet.mock.mockImplementation(async (url: unknown) => {
    const u = new URL(String(url))
    if (u.searchParams.get("media_plan_version") === "501") {
      return { data: [savedBurst] }
    }
    return { data: [] }
  })

  const items = await fetchXanoTableForEndpoint(
    "media_plan_search",
    "reopen-search-1",
    1,
    501,
    "TEST_REOPEN"
  )

  assert.equal(items.length, 1)
  const burst = items[0].bursts_json[0]
  assert.equal(burst.budget, 10000)
  assert.ok(burst.start_date)
  assert.ok(burst.end_date)
  assert.equal(items[0].total_budget, 10000)
})
