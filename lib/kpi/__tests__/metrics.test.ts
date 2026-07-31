import assert from "node:assert/strict"
import test from "node:test"
import {
  formatPercentForInput,
  parsePercentHeuristic,
  validateKpiMetricValue,
} from "../metrics.js"
import { emptyPublisherKpiMetricDefaults } from "../publisherKpiDefaults.js"
import { publisherKpiCreateBodySchema } from "../types.js"

test("sub-1% target round-trips: enter 0.45 → store decimal → display 0.45%, not 45%", () => {
  const stored = parsePercentHeuristic("0.45")
  assert.equal(stored, 0.0045)
  const display = formatPercentForInput(stored)
  assert.equal(display, "0.45%")
  assert.equal(parsePercentHeuristic(display), 0.0045)
})

test("whole-number percentage points still convert to decimals (8 → 0.08)", () => {
  assert.equal(parsePercentHeuristic("8"), 0.08)
  assert.equal(parsePercentHeuristic("1.2%"), 0.012)
  assert.equal(formatPercentForInput(0.08), "8.00%")
})

test("empty percent input is unset (null), not zero", () => {
  assert.equal(parsePercentHeuristic(""), null)
  assert.equal(parsePercentHeuristic("  "), null)
  assert.equal(formatPercentForInput(null), "")
})

test("new publisher KPI row defaults metrics to null (unset), not 0", () => {
  const defaults = emptyPublisherKpiMetricDefaults()
  assert.equal(defaults.ctr, null)
  assert.equal(defaults.cpv, null)
  assert.equal(defaults.conversion_rate, null)
  assert.equal(defaults.vtr, null)
  assert.equal(defaults.frequency, null)
})

test("publisher create schema keeps null for unset and preserves explicit 0", () => {
  const unset = publisherKpiCreateBodySchema.parse({
    publisher: "pub_1",
    media_type: "digitalDisplay",
    bid_strategy: "cpm",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
  })
  assert.equal(unset.ctr, null)
  assert.equal(unset.cpv, null)

  const explicitZero = publisherKpiCreateBodySchema.parse({
    publisher: "pub_1",
    media_type: "digitalDisplay",
    bid_strategy: "cpm",
    ctr: 0,
    cpv: 0,
    conversion_rate: 0,
    vtr: 0,
    frequency: 0,
  })
  assert.equal(explicitZero.ctr, 0)
  assert.equal(explicitZero.frequency, 0)
})

test("publisher create schema rejects negatives and percent > 100pp", () => {
  const neg = publisherKpiCreateBodySchema.safeParse({
    publisher: "pub_1",
    media_type: "digitalDisplay",
    bid_strategy: "cpm",
    ctr: -0.01,
    cpv: 0.1,
    conversion_rate: null,
    vtr: null,
    frequency: null,
  })
  assert.equal(neg.success, false)

  const over = publisherKpiCreateBodySchema.safeParse({
    publisher: "pub_1",
    media_type: "digitalDisplay",
    bid_strategy: "cpm",
    ctr: 1.5,
    cpv: 0.1,
    conversion_rate: null,
    vtr: null,
    frequency: null,
  })
  assert.equal(over.success, false)
})

test("validateKpiMetricValue: percent 0–100pp, frequency >= 0, cpv >= 0", () => {
  assert.equal(validateKpiMetricValue("percent", null), null)
  assert.equal(validateKpiMetricValue("percent", 0.0045), null)
  assert.ok(validateKpiMetricValue("percent", -0.01))
  assert.ok(validateKpiMetricValue("percent", 1.5))

  assert.equal(validateKpiMetricValue("count", null), null)
  assert.equal(validateKpiMetricValue("count", 0), null)
  assert.ok(validateKpiMetricValue("count", -1))

  assert.equal(validateKpiMetricValue("rate", null), null)
  assert.equal(validateKpiMetricValue("rate", 0), null)
  assert.ok(validateKpiMetricValue("rate", -0.01))
})
