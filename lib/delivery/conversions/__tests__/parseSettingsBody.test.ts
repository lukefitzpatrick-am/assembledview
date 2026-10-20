import assert from "node:assert/strict"
import { test } from "node:test"

import { parseConversionSettingsBody } from "../parseSettingsBody"

test("valid body parses and lower-cases Meta keys", () => {
  const parsed = parseConversionSettingsBody({
    enabled: true,
    headline: "purchases",
    showRevenue: true,
    events: [{ platform: "meta_ads", eventKey: " Purchase ", category: "purchase", includeValue: true, label: " Sales " }],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.events, [
    { platform: "meta_ads", eventKey: "purchase", label: "Sales", category: "purchase", includeValue: true },
  ])
  assert.deepEqual(parsed.settings, { enabled: true, headline: "purchases", showRevenue: true })
})

test("Google action resource names keep their case", () => {
  const parsed = parseConversionSettingsBody({
    enabled: true,
    headline: "conversions",
    showRevenue: false,
    events: [{ platform: "google_ads", eventKey: "customers/1/conversionActions/AbC", category: "other" }],
  })
  assert.equal(parsed.ok && parsed.events[0]!.eventKey, "customers/1/conversionActions/AbC")
})

test("duplicate Meta purchase keys are refused", () => {
  const parsed = parseConversionSettingsBody({
    enabled: true,
    headline: "purchases",
    showRevenue: false,
    events: [
      { platform: "meta_ads", eventKey: "purchase", category: "purchase" },
      { platform: "meta_ads", eventKey: "omni_purchase", category: "purchase" },
    ],
  })
  assert.equal(parsed.ok, false)
})

test("bad headline, platform and category are refused", () => {
  const parsed = parseConversionSettingsBody({
    enabled: "yes",
    headline: "sales",
    showRevenue: false,
    events: [
      { platform: "linkedin", eventKey: "x", category: "purchase" },
      { platform: "meta_ads", eventKey: "lead", category: "signup" },
    ],
  })
  assert.equal(parsed.ok, false)
  if (parsed.ok) return
  assert.ok(parsed.problems.length >= 4)
})
