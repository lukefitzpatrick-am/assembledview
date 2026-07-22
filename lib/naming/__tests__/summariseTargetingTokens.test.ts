import assert from "node:assert/strict"
import test from "node:test"

import type { TokenOverrides } from "../channelTabs.js"
import {
  applyAvaSuggestions,
  collectTokenSources,
  sanitiseTokenOverrides,
  summariseTargetingTokens,
  type TokenSourceItem,
} from "../summariseTargetingTokens.js"

const sources: TokenSourceItem[] = [
  {
    line_item_id: "dd1",
    targeting_raw: "Retargeting - A25-54",
    geo_raw: "New South Wales",
  },
  {
    line_item_id: "dd2",
    targeting_raw: "Brand Exact",
    geo_raw: "",
  },
]

test("sanitiseTokenOverrides: AVA off / empty suggestions → empty overrides (slugify path)", () => {
  assert.deepEqual(sanitiseTokenOverrides(sources, undefined), {})
  assert.deepEqual(sanitiseTokenOverrides(sources, {}), {})
})

test("sanitiseTokenOverrides: accepts AVA tokens after slugify", () => {
  const overrides = sanitiseTokenOverrides(sources, {
    dd1: { targeting: "Retargeting A25-54!!", geo: "NSW Metro" },
    dd2: { targeting: "Brand_Exact" },
  })
  assert.equal(overrides.dd1?.targeting, "retargeting_a2554")
  assert.equal(overrides.dd1?.geo, "nsw_metro")
  assert.equal(overrides.dd2?.targeting, "brand_exact")
  assert.equal(overrides.dd2?.geo, undefined)
})

test("sanitiseTokenOverrides: invalid AVA token falls back to slugify(raw)", () => {
  // Force empty slug from AVA → fall back
  const overrides = sanitiseTokenOverrides(sources, {
    dd1: { targeting: "---", geo: "!!!" },
  })
  assert.equal(overrides.dd1?.targeting, "retargeting_a2554")
  assert.equal(overrides.dd1?.geo, "new_south_wales")
})

test("applyAvaSuggestions: counts only accepted AVA fields", () => {
  const { overrides, appliedCount } = applyAvaSuggestions(sources, {
    dd1: { targeting: "prospecting", geo: "vic" },
    dd2: { targeting: "---" }, // falls back to slug — not counted as AVA-applied
  })
  assert.equal(appliedCount, 2)
  assert.equal(overrides.dd1?.targeting, "prospecting")
  assert.equal(overrides.dd1?.geo, "vic")
  assert.equal(overrides.dd2?.targeting, "brand_exact")
})

test("summariseTargetingTokens: without suggest → empty overrides, usedAva false", async () => {
  const result = await summariseTargetingTokens(sources)
  assert.equal(result.usedAva, false)
  assert.equal(result.appliedCount, 0)
  assert.deepEqual(result.overrides, {})
})

test("summariseTargetingTokens: suggest error → empty overrides (download unblocked)", async () => {
  const result = await summariseTargetingTokens(sources, {
    suggest: async () => {
      throw new Error("AVA down")
    },
  })
  assert.equal(result.usedAva, false)
  assert.deepEqual(result.overrides, {})
  assert.equal(result.error, "AVA down")
})

test("summariseTargetingTokens: suggest success → only targeting/geo in overrides", async () => {
  const result = await summariseTargetingTokens(sources, {
    suggest: async () => ({
      dd1: { targeting: "retargeting", geo: "nsw" },
    }),
  })
  assert.equal(result.usedAva, true)
  assert.ok(result.appliedCount >= 1)
  const keys = Object.keys(result.overrides.dd1 ?? {})
  assert.deepEqual(keys.sort(), ["geo", "targeting"])
  // other line untouched
  assert.equal(result.overrides.dd2, undefined)
})

test("collectTokenSources: pulls raw fields from naming-relevant channels", () => {
  const items = collectTokenSources({
    digitalDisplay: [
      {
        line_item_id: "dd1",
        publisher: "Nine",
        targetingAttribute: "In-stream",
        market: "National",
      },
    ],
    television: [{ line_item_id: "tv1", targeting: "ignore" }],
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].line_item_id, "dd1")
  assert.equal(items[0].targeting_raw, "In-stream")
  assert.equal(items[0].geo_raw, "National")
})

test("AVA on vs off: overrides only change targeting/geo tokens", () => {
  const off: TokenOverrides = sanitiseTokenOverrides(sources, undefined)
  const on = sanitiseTokenOverrides(sources, {
    dd1: { targeting: "clean_retarget", geo: "nsw" },
  })
  assert.deepEqual(off, {})
  assert.deepEqual(Object.keys(on.dd1 ?? {}).sort(), ["geo", "targeting"])
  assert.equal(on.dd1?.targeting, "clean_retarget")
  assert.equal(on.dd1?.geo, "nsw")
})
