import assert from "node:assert/strict"
import test from "node:test"
import {
  applyAdjustLineItemOps,
  formatAdjustDiffSummary,
} from "../applyAdjustOps.js"

const sample = (): Record<string, unknown>[] => [
  {
    network: "QMS",
    format: "Portrait",
    buy_type: "",
    market: "Sydney",
    is_bonus: false,
    bursts: [{ budget: "1000", startDate: "2026-01-01", endDate: "2026-01-07" }],
  },
  {
    network: "oOh!",
    format: "Landscape",
    buy_type: "Panels",
    market: "Melbourne",
    is_bonus: true,
    bursts: [{ budget: "500", startDate: "2026-01-01", endDate: "2026-01-07" }],
  },
  {
    network: "QMS",
    format: "Portrait",
    buy_type: "",
    market: "Brisbane",
    is_bonus: false,
    bursts: [{ budget: "200", startDate: "2026-02-01", endDate: "2026-02-07" }],
  },
]

test("setField market on all lines; bursts untouched", () => {
  const source = sample()
  const burst0 = source[0].bursts
  const result = applyAdjustLineItemOps(
    source,
    [{ type: "setField", field: "market", value: "National" }],
    "all",
  )
  assert.equal(result.matchedCount, 3)
  assert.ok(result.items.every((r) => r.market === "National"))
  assert.deepEqual(result.items[0].bursts, burst0)
  assert.notEqual(result.items, source)
  assert.equal(source[0].market, "Sydney")
})

test("moveField format → buy_type clears source", () => {
  const result = applyAdjustLineItemOps(
    sample(),
    [{ type: "moveField", fromField: "format", toField: "buy_type" }],
    "all",
  )
  assert.equal(result.items[0].buy_type, "Portrait")
  assert.equal(result.items[0].format, "")
  assert.equal(result.items[1].buy_type, "Landscape")
  assert.equal(result.items[1].format, "")
})

test("scope where + isBonus", () => {
  const where = applyAdjustLineItemOps(
    sample(),
    [{ type: "setField", field: "market", value: "National" }],
    { where: { field: "network", equals: "QMS" } },
  )
  assert.equal(where.matchedCount, 2)
  assert.equal(where.items[0].market, "National")
  assert.equal(where.items[1].market, "Melbourne")
  assert.equal(where.items[2].market, "National")

  const bonus = applyAdjustLineItemOps(
    sample(),
    [{ type: "clearField", field: "format" }],
    { isBonus: true },
  )
  assert.equal(bonus.matchedCount, 1)
  assert.equal(bonus.items[1].format, "")
  assert.equal(bonus.items[0].format, "Portrait")
})

test("blocked money fields set moneyHint", () => {
  const result = applyAdjustLineItemOps(
    sample(),
    [{ type: "setField", field: "budget", value: "999" }],
    "all",
  )
  assert.equal(result.summaryParts.length, 0)
  assert.equal(result.moneyHint, true)
  assert.ok(result.blockedOps.length > 0)
  assert.equal(
    (result.items[0].bursts as { budget: string }[])[0].budget,
    "1000",
  )
})

test("diff summary wording", () => {
  const result = applyAdjustLineItemOps(
    sample(),
    [
      { type: "setField", field: "buy_type", value: "Panels" },
      { type: "clearField", field: "format" },
    ],
    "all",
  )
  const text = formatAdjustDiffSummary(result)
  assert.match(text, /3 line/)
  assert.match(text, /buy_type set to 'Panels'/)
  assert.match(text, /format cleared/)
})
