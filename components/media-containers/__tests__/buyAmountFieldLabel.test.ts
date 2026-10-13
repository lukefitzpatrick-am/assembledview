import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buyAmountUnitPriceWarning,
  getBuyAmountColumnLabel,
} from "@/components/media-containers/burst-calculated-fields"
import { parseMoneyInput } from "@/lib/format/money"

describe("getBuyAmountColumnLabel", () => {
  it("names the unit price for each buy type", () => {
    assert.equal(getBuyAmountColumnLabel("insertions"), "Cost per insertion")
    assert.equal(getBuyAmountColumnLabel("spots"), "Cost per spot")
    assert.equal(getBuyAmountColumnLabel("panels"), "Cost per panel")
    assert.equal(getBuyAmountColumnLabel("cpm"), "CPM")
    assert.equal(getBuyAmountColumnLabel("cpc"), "CPC")
    assert.equal(getBuyAmountColumnLabel("cpv"), "CPV")
    for (const buyType of ["fixed_cost", "package", "bonus", "package_inclusions"]) {
      assert.equal(getBuyAmountColumnLabel(buyType), "Cost")
    }
    assert.equal(getBuyAmountColumnLabel("cpt"), "Buy Amount")
    assert.equal(getBuyAmountColumnLabel(""), "Buy Amount")
    assert.equal(getBuyAmountColumnLabel(null), "Buy Amount")
  })
})

describe("buyAmountUnitPriceWarning", () => {
  it("warns for a $1 insertion price with a large calculated quantity", () => {
    const buyAmount = parseMoneyInput("$1.00")
    assert.equal(buyAmount, 1)
    assert.equal(
      buyAmountUnitPriceWarning("insertions", buyAmount ?? Number.NaN, 3870),
      "Check this: Cost per insertion is the price of one insertion, not the number of insertions."
    )
  })

  it("stays quiet for a real unit price and a small quantity", () => {
    assert.equal(buyAmountUnitPriceWarning("insertions", 500, 2), null)
  })

  it("uses the matching unit for spots and panels, and skips other buy types", () => {
    assert.equal(
      buyAmountUnitPriceWarning("spots", 1, 101),
      "Check this: Cost per spot is the price of one spot, not the number of spots."
    )
    assert.equal(
      buyAmountUnitPriceWarning("panels", 0, 101),
      "Check this: Cost per panel is the price of one panel, not the number of panels."
    )
    assert.equal(buyAmountUnitPriceWarning("cpm", 1, 3870), null)
    assert.equal(buyAmountUnitPriceWarning("insertions", 1, 100), null)
    assert.equal(buyAmountUnitPriceWarning("insertions", 1.01, 3870), null)
  })
})
