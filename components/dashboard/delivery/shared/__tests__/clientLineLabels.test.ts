import assert from "node:assert/strict"
import test from "node:test"

import {
  CLIENT_REPORTED_SPEND_LABEL,
  clientLinePillText,
  isFixedCostBuyTypeText,
} from "../clientLineLabels"

test("fixed-cost buy type spellings are recognised", () => {
  for (const v of ["fixed_cost", "Fixed Cost", "fixed cost", "FIXED-COST", " fixed_cost_media ", "Fixed cost media"]) {
    assert.equal(isFixedCostBuyTypeText(v), true, v)
  }
  for (const v of ["cpm", "cpc", "package", "fixed", "", null, undefined]) {
    assert.equal(isFixedCostBuyTypeText(v), false, String(v))
  }
})

test("line pill hides fixed cost and keeps other buy types", () => {
  assert.equal(clientLinePillText("fixed_cost"), undefined)
  assert.equal(clientLinePillText("Fixed Cost"), undefined)
  assert.equal(clientLinePillText("cpm"), "cpm")
  assert.equal(clientLinePillText(" Meta "), "Meta")
  assert.equal(clientLinePillText(""), undefined)
  assert.equal(clientLinePillText(null), undefined)
})

test("reported spend label does not mention fixed cost", () => {
  assert.equal(CLIENT_REPORTED_SPEND_LABEL, "Reported spend")
  assert.doesNotMatch(CLIENT_REPORTED_SPEND_LABEL, /fixed/i)
})
