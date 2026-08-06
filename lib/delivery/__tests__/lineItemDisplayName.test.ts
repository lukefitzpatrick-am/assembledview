import assert from "node:assert/strict"
import test from "node:test"

import {
  clampDisplayLabel,
  deliveryLineItemDisplayName,
  stripPlanCodeSuffix,
} from "../lineItemDisplayName.js"

/** Real BOSS005 v17 published tip (measured in Supabase) — targeting is 160 chars, not 222. */
const BOSS005PD1_TARGETING =
  "Native placements across agricultural and machinery publisher sites, as well as commercial and industrial vehicles, business and finance, and sports categories."

const BOSS005PD2_TARGETING = "Programmatic display with geo & audience targeting"

test("prog Taboola + long targeting clamps on word boundary; full preserved", () => {
  assert.equal(BOSS005PD1_TARGETING.length, 160)

  const { label, full } = deliveryLineItemDisplayName({
    platform: "Taboola",
    line_item_id: "BOSS005PD1",
    attrs: { creative_targeting: BOSS005PD1_TARGETING },
  })

  assert.equal(
    full,
    `Taboola • ${BOSS005PD1_TARGETING}`,
  )
  assert.ok(label.endsWith("…"), `expected ellipsis, got ${JSON.stringify(label)}`)
  assert.ok(label.length <= 90, `label longer than 90: ${label.length}`)
  assert.equal(
    label,
    "Taboola • Native placements across agricultural and machinery publisher sites, as well…",
  )
  assert.notEqual(label, full)
})

test("prog DV360 + short targeting joins unclamped", () => {
  const { label, full } = deliveryLineItemDisplayName({
    platform: "DV360",
    line_item_id: "BOSS005PD2",
    creative_targeting: BOSS005PD2_TARGETING,
  })
  const expected = `DV360 • ${BOSS005PD2_TARGETING}`
  assert.equal(full, expected)
  assert.equal(label, expected)
  assert.ok(!label.endsWith("…"))
})

test("digi: publisher used when platform empty", () => {
  const { label, full } = deliveryLineItemDisplayName({
    publisher: "CarSales",
    platform: "",
    creative_targeting: "Tillage & Seeding",
    line_item_id: "BOSS001DD1",
  })
  assert.equal(full, "CarSales • Tillage & Seeding")
  assert.equal(label, full)
})

test("both source and targeting empty → line_item_id fallback, not empty string", () => {
  const { label, full } = deliveryLineItemDisplayName({
    platform: "  ",
    publisher: null,
    creative_targeting: "",
    line_item_id: "BOSS005PD1",
  })
  assert.equal(full, "BOSS005PD1")
  assert.equal(label, "BOSS005PD1")
})

test("targeting under attrs but not flat resolves", () => {
  const { full } = deliveryLineItemDisplayName({
    platform: "DV360",
    attrs: { creative_targeting: "Geo only" },
  })
  assert.equal(full, "DV360 • Geo only")
})

test("targeting flat but not under attrs resolves", () => {
  const { full } = deliveryLineItemDisplayName({
    platform: "DV360",
    creative_targeting: "Flat targeting",
    attrs: {},
  })
  assert.equal(full, "DV360 • Flat targeting")
})

test("attrs.creative_targeting wins over flat creative when both present", () => {
  const { full } = deliveryLineItemDisplayName({
    platform: "Taboola",
    creative: "Should not win",
    attrs: {
      creative_targeting: "Wins",
      creative: "Also should not win",
    },
  })
  assert.equal(full, "Taboola • Wins")
})

test("social parity: Meta header matches pre-refactor formatLineItemHeader", () => {
  const meta = {
    platform: "Meta",
    creative_targeting: "Lookalike AU 1% • Feed",
    line_item_name: undefined,
    line_item_id: "BOSS005SO1",
  }
  // Pre-refactor behaviour: platform • creative_targeting (unclamped string)
  const legacy = (() => {
    const platform = String(meta.platform ?? "").trim()
    const targeting = String(meta.creative_targeting ?? "").trim()
    const parts = [platform, targeting].filter(Boolean)
    if (parts.length) return parts.join(" • ")
    return meta.line_item_name || meta.line_item_id || "Line item"
  })()

  const { full } = deliveryLineItemDisplayName(meta, { maxLength: Number.POSITIVE_INFINITY })
  assert.equal(full, legacy)
  assert.equal(full, "Meta • Lookalike AU 1% • Feed")
})

test("clampDisplayLabel is a no-op when under max", () => {
  assert.equal(clampDisplayLabel("short", 90), "short")
})

test("stripPlanCodeSuffix — primary: known plan line id", () => {
  assert.equal(
    stripPlanCodeSuffix("Trailers-BOSS005SE1", ["BOSS005SE1"]),
    "Trailers",
  )
  assert.equal(
    stripPlanCodeSuffix("Service bodies-boss005se1", ["BOSS005SE1"]),
    "Service bodies",
  )
})

test("stripPlanCodeSuffix — secondary: plan-code shape not in known ids (rollover)", () => {
  assert.equal(
    stripPlanCodeSuffix("Canopies-BOSS002SE1", ["BOSS005SE1"]),
    "Canopies",
  )
})

test("stripPlanCodeSuffix — BOSS005 expected display names", () => {
  const known = ["BOSS005SE1"]
  const raw = [
    "Trailers-BOSS002SE1",
    "Service bodies-BOSS002SE1",
    "Canopies-BOSS002SE1",
    "Ute-BOSS002SE1",
    "Trays-BOSS002SE1",
    "Toolbox-BOSS002SE1",
    "Tandem-BOSS002SE1",
    "Bronco built-BOSS002SE1",
    "Boss-BOSS002SE1",
    "axle-BOSS002SE1",
  ]
  assert.deepEqual(
    raw.map((n) => stripPlanCodeSuffix(n, known)),
    [
      "Trailers",
      "Service bodies",
      "Canopies",
      "Ute",
      "Trays",
      "Toolbox",
      "Tandem",
      "Bronco built",
      "Boss",
      "axle",
    ],
  )
})

test("stripPlanCodeSuffix — leave alone when suffix is not a plan code", () => {
  assert.equal(
    stripPlanCodeSuffix("Brand-Awareness-AU", ["BOSS005SE1"]),
    "Brand-Awareness-AU",
  )
})

test("stripPlanCodeSuffix — never return empty; no dash unchanged", () => {
  assert.equal(stripPlanCodeSuffix("-BOSS005SE1", ["BOSS005SE1"]), "-BOSS005SE1")
  assert.equal(stripPlanCodeSuffix("Trailers", ["BOSS005SE1"]), "Trailers")
})
