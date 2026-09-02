import assert from "node:assert/strict"
import test from "node:test"

import {
  oohFormatChoiceLabels,
  resolveControlledBuyType,
  resolveControlledFormat,
} from "../resolveControlledOoh"

test("DIGITAL LARGE FORMAT resolves to large_format via the existing matcher", () => {
  assert.equal(resolveControlledFormat("DIGITAL LARGE FORMAT"), "large_format")
})

test("JCDecaux DIGITAL LARGE FORMAT resolves to large_format after the publisher prefix", () => {
  assert.equal(
    resolveControlledFormat("JCDecaux DIGITAL LARGE FORMAT", "JCDecaux"),
    "large_format",
  )
})

test("unmatchable prose does not guess a format", () => {
  assert.equal(resolveControlledFormat("ZZORP BLIB"), null)
  assert.equal(resolveControlledFormat("Portrait"), null)
  assert.equal(resolveControlledFormat("ESB"), null)
})

test("already-canonical format and label pass through", () => {
  assert.equal(resolveControlledFormat("large_format"), "large_format")
  assert.equal(resolveControlledFormat("Large Format"), "large_format")
  assert.equal(resolveControlledBuyType("fixed_cost"), "fixed_cost")
  assert.equal(resolveControlledBuyType("Fixed Cost"), "fixed_cost")
})

test("format choice labels are the AV vocabulary with Other last", () => {
  assert.deepEqual(oohFormatChoiceLabels(), [
    "Active",
    "Large Format",
    "Retail",
    "Small Format",
    "Street Furniture",
    "Transit",
    "Other",
  ])
})
