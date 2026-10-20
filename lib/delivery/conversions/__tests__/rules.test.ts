import assert from "node:assert/strict"
import { test } from "node:test"

import {
  conversionEventProblems,
  conversionPlatformsForSection,
  cpa,
  cvrPct,
  formatRoas,
  headlineCount,
  roas,
  rollupConversions,
  sumConversionDays,
  valueAllowed,
  type ConversionEventChoice,
  type ConversionFactRow,
} from "../rules"

const purchase: ConversionEventChoice = {
  platform: "meta_ads",
  eventKey: "purchase",
  label: null,
  category: "purchase",
  includeValue: true,
}
const lead: ConversionEventChoice = {
  platform: "meta_ads",
  eventKey: "lead",
  label: null,
  category: "lead",
  includeValue: false,
}

function row(p: Partial<ConversionFactRow>): ConversionFactRow {
  return {
    lineItemId: "curatif004sm1",
    date: "2026-10-01",
    platform: "meta_ads",
    eventKey: "purchase",
    conversions: 0,
    conversionValue: null,
    ...p,
  }
}

test("purchase and omni_purchase cannot both be chosen", () => {
  const problems = conversionEventProblems([
    purchase,
    { ...purchase, eventKey: "omni_purchase", includeValue: false },
  ])
  assert.ok(problems.some((p) => p.includes("purchase and omni_purchase")))
  assert.deepEqual(conversionEventProblems([purchase, lead]), [])
})

test("Google all_primary cannot be combined with single actions", () => {
  const problems = conversionEventProblems([
    { platform: "google_ads", eventKey: "all_primary", label: null, category: "purchase", includeValue: true },
    {
      platform: "google_ads",
      eventKey: "customers/1/conversionActions/2",
      label: null,
      category: "purchase",
      includeValue: false,
    },
  ])
  assert.equal(problems.length, 1)
})

test("revenue only from purchase events with usable value", () => {
  assert.equal(valueAllowed(purchase), true)
  assert.equal(valueAllowed({ ...purchase, eventKey: "add_to_cart" }), false)
  assert.equal(valueAllowed({ ...lead }), false)
  assert.equal(valueAllowed({ platform: "dv360", eventKey: "total_conversions", category: "purchase" }), false)
  assert.equal(valueAllowed({ platform: "google_ads", eventKey: "all_primary", category: "purchase" }), true)
  assert.ok(conversionEventProblems([{ ...lead, includeValue: true }]).length > 0)
})

test("rollup counts only chosen keys: omni_purchase rows never add to purchase", () => {
  const rows = [
    row({ eventKey: "purchase", conversions: 6, conversionValue: 900 }),
    row({ eventKey: "omni_purchase", conversions: 6, conversionValue: 900 }),
    row({ eventKey: "add_to_cart", conversions: 50, conversionValue: 5000 }),
    row({ eventKey: "lead", conversions: 3, conversionValue: 0 }),
  ]
  const out = rollupConversions(rows, [purchase, lead])
  assert.equal(out.length, 1)
  assert.deepEqual(out[0]!.daily, [
    { date: "2026-10-01", conversions: 9, purchases: 6, leads: 3, revenue: 900 },
  ])
})

test("revenue ignores include_value on events that cannot carry value", () => {
  const out = rollupConversions(
    [row({ eventKey: "add_to_cart", conversions: 5, conversionValue: 500 })],
    [{ platform: "meta_ads", eventKey: "add_to_cart", label: null, category: "purchase", includeValue: true }],
  )
  assert.equal(out[0]!.daily[0]!.revenue, 0)
  assert.equal(out[0]!.daily[0]!.purchases, 5)
})

test("CM360 floodlights win over DV360 on the same line", () => {
  const choices: ConversionEventChoice[] = [
    { platform: "dv360", eventKey: "total_conversions", label: null, category: "other", includeValue: false },
    { platform: "cm360", eventKey: "total_conversions", label: null, category: "other", includeValue: false },
  ]
  const out = rollupConversions(
    [
      row({ lineItemId: "jayco001pd1", platform: "dv360", eventKey: "total_conversions", conversions: 10 }),
      row({ lineItemId: "jayco001pd1", platform: "cm360", eventKey: "total_conversions", conversions: 4 }),
      row({ lineItemId: "molic001pd1", platform: "dv360", eventKey: "total_conversions", conversions: 7 }),
    ],
    choices,
  )
  const byLine = Object.fromEntries(out.map((l) => [l.lineItemId, l.daily[0]!.conversions]))
  assert.deepEqual(byLine, { jayco001pd1: 4, molic001pd1: 7 })
})

test("no chosen events means nothing rolls up", () => {
  assert.deepEqual(rollupConversions([row({ conversions: 4 })], []), [])
})

test("ratios: ROAS null at zero spend, CPA null at zero conversions", () => {
  assert.equal(roas(500, 0), null)
  assert.equal(roas(1050, 250), 4.2)
  assert.equal(formatRoas(4.2), "4.20x")
  assert.equal(formatRoas(null), "—")
  assert.equal(cpa(100, 0), null)
  assert.equal(cpa(100, 4), 25)
  assert.equal(cvrPct(5, 0), null)
  assert.equal(cvrPct(5, 100), 5)
})

test("window sum and headline choice", () => {
  const days = [
    { date: "2026-10-01", conversions: 3, purchases: 2, leads: 1, revenue: 100 },
    { date: "2026-10-21", conversions: 9, purchases: 9, leads: 0, revenue: 900 },
  ]
  const totals = sumConversionDays(days, (d) => d <= "2026-10-20")
  assert.deepEqual(totals, { conversions: 3, purchases: 2, leads: 1, revenue: 100 })
  assert.equal(headlineCount(totals, "purchases"), 2)
  assert.equal(headlineCount(totals, "leads"), 1)
  assert.equal(headlineCount(totals, "conversions"), 3)
})

test("section platforms leave OOH out", () => {
  assert.deepEqual(conversionPlatformsForSection("programmatic-ooh"), [])
  assert.deepEqual(conversionPlatformsForSection("search"), ["google_ads"])
  assert.deepEqual(conversionPlatformsForSection("programmatic-video"), ["dv360", "cm360"])
})
