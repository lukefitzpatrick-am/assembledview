import assert from "node:assert/strict"
import test from "node:test"

import type { TokenOverrides } from "../channelTabs.js"
import { buildAvaNamingTokensPrompt } from "../suggestAvaNamingTokens.js"
import {
  NAMING_TOKEN_MAX_LEN,
  applyAvaSuggestions,
  clampNamingToken,
  collectTokenSources,
  normaliseGeoToken,
  sanitiseTokenOverrides,
  summariseTargetingTokens,
  type TokenSourceItem,
} from "../summariseTargetingTokens.js"

const LONG_TARGETING =
  "National — Contextual Site Alignment, Health & Wellbeing intenders 25-54"

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

test("clampNamingToken: truncates on underscore boundary, never mid-segment", () => {
  const long =
    "contextual_site_alignment_health_wellbeing_intenders_2554"
  const clamped = clampNamingToken(long)
  assert.ok(clamped.length <= NAMING_TOKEN_MAX_LEN)
  assert.ok(!clamped.endsWith("_"))
  // Should not cut inside a word segment
  assert.ok(!/_[a-z0-9]*$/.test(clamped) || clamped.includes("_"))
  const parts = clamped.split("_")
  for (const part of parts) {
    assert.ok(part.length > 0)
  }
})

test("clampNamingToken: short tokens unchanged; empty stays empty", () => {
  assert.equal(clampNamingToken("retargeting"), "retargeting")
  assert.equal(clampNamingToken(""), "")
})

test("normaliseGeoToken: National → au; NSW aliases → nsw", () => {
  assert.equal(normaliseGeoToken("National"), "au")
  assert.equal(normaliseGeoToken("new_south_wales"), "nsw")
  assert.equal(normaliseGeoToken("NSW"), "nsw")
  // Unknown short free token kept (open question — soft vocab)
  assert.equal(normaliseGeoToken("sydney_metro"), "sydney_metro")
})

test("sanitiseTokenOverrides: AVA off / empty suggestions → empty overrides (slugify path)", () => {
  assert.deepEqual(sanitiseTokenOverrides(sources, undefined), {})
  assert.deepEqual(sanitiseTokenOverrides(sources, {}), {})
})

test("sanitiseTokenOverrides: accepts AVA tokens after slugify + clamp", () => {
  const overrides = sanitiseTokenOverrides(sources, {
    dd1: { targeting: "Retargeting A25-54!!", geo: "NSW Metro" },
    dd2: { targeting: "Brand_Exact" },
  })
  assert.equal(overrides.dd1?.targeting, "retargeting_a2554")
  assert.ok((overrides.dd1?.targeting?.length ?? 0) <= NAMING_TOKEN_MAX_LEN)
  // NSW Metro → nsw_metro; not in alias map as whole — stays free short token
  assert.equal(overrides.dd1?.geo, "nsw_metro")
  assert.equal(overrides.dd2?.targeting, "brand_exact")
  assert.equal(overrides.dd2?.geo, undefined)
})

test("sanitiseTokenOverrides: invalid AVA → clamped slug of raw (geo aliases applied)", () => {
  const overrides = sanitiseTokenOverrides(sources, {
    dd1: { targeting: "---", geo: "!!!" },
  })
  assert.equal(overrides.dd1?.targeting, "retargeting_a2554")
  // New South Wales → nsw via geo alias map
  assert.equal(overrides.dd1?.geo, "nsw")
})

test("sanitiseTokenOverrides: long targeting string → token ≤24", () => {
  const longSources: TokenSourceItem[] = [
    {
      line_item_id: "long1",
      targeting_raw: LONG_TARGETING,
      geo_raw: "National",
    },
  ]
  // AVA returns a sensible short token
  const fromAva = sanitiseTokenOverrides(longSources, {
    long1: { targeting: "csa_health_2554", geo: "national" },
  })
  assert.ok((fromAva.long1?.targeting?.length ?? 99) <= NAMING_TOKEN_MAX_LEN)
  assert.equal(fromAva.long1?.targeting, "csa_health_2554")
  assert.equal(fromAva.long1?.geo, "au") // national → au

  // Invalid AVA → clamped slug of the long raw (still ≤24)
  const fallback = sanitiseTokenOverrides(longSources, {
    long1: { targeting: "---", geo: "---" },
  })
  assert.ok((fallback.long1?.targeting?.length ?? 99) <= NAMING_TOKEN_MAX_LEN)
  assert.ok((fallback.long1?.geo?.length ?? 99) <= NAMING_TOKEN_MAX_LEN)
  assert.equal(fallback.long1?.geo, "au")
  assert.ok(fallback.long1?.targeting)
})

test("sanitiseTokenOverrides: overlong AVA suggestion is length-clamped", () => {
  const overrides = sanitiseTokenOverrides(sources, {
    dd1: {
      targeting:
        "this_is_an_extremely_long_targeting_token_that_must_be_clamped",
      geo: "vic",
    },
  })
  assert.ok((overrides.dd1?.targeting?.length ?? 99) <= NAMING_TOKEN_MAX_LEN)
  assert.equal(overrides.dd1?.geo, "vic")
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
  assert.equal(result.overrides.dd2, undefined)
})

test("collectTokenSources: enriched context + digi-relevant channels only", () => {
  const items = collectTokenSources(
    {
      digitalDisplay: [
        {
          line_item_id: "dd1",
          publisher: "Nine",
          targetingAttribute: "In-stream",
          market: "National",
        },
      ],
      television: [{ line_item_id: "tv1", targeting: "ignore" }],
    },
    { globals: { brand: "acme", campaign: "summer" } },
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].line_item_id, "dd1")
  assert.equal(items[0].targeting_raw, "In-stream")
  assert.equal(items[0].geo_raw, "National")
  assert.equal(items[0].channel, "digitalDisplay")
  assert.equal(items[0].publisher, "Nine")
  assert.equal(items[0].family, "cm360")
  assert.equal(items[0].brand, "acme")
  assert.equal(items[0].campaign, "summer")
  assert.ok((items[0].element_order?.length ?? 0) > 0)
  assert.ok(
    items[0].element_order?.some((line) => line.includes("targeting")),
  )
})

test("buildAvaNamingTokensPrompt: includes context fields and length rule", () => {
  const prompt = buildAvaNamingTokensPrompt([
    {
      line_item_id: "dd1",
      targeting_raw: LONG_TARGETING,
      geo_raw: "National",
      channel: "digitalDisplay",
      family: "cm360",
      publisher: "Nine",
      media_type: "display",
      buy_type: "cpm",
      brand: "acme",
      campaign: "summer",
      element_order: ["placement: brand - campaign - targeting"],
      best_practice_notes: "Prefer short site lists",
    },
  ])
  assert.match(prompt, new RegExp(String(NAMING_TOKEN_MAX_LEN)))
  assert.match(prompt, /csa/)
  assert.match(prompt, /digitalDisplay/)
  assert.match(prompt, /Contextual Site Alignment/)
  assert.match(prompt, /Prefer short site lists/)
  assert.match(prompt, /element_order/)
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
