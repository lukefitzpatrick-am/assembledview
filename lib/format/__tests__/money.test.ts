import assert from "node:assert/strict"
import test from "node:test"

import { formatAUD, formatBuyAmount } from "../money.js"

test("formatAUD rounds to 2 decimal places", () => {
  assert.equal(formatAUD(12.345), "$12.35")
})

test("formatBuyAmount preserves up to 4 decimal places", () => {
  assert.equal(formatBuyAmount(12.34567), "$12.3457")
})

test("AUD formatters return zero for invalid values", () => {
  assert.equal(formatAUD("not money"), "$0.00")
  assert.equal(formatBuyAmount(Number.NaN), "$0.00")
})

test("AUD formatters include thousands grouping", () => {
  assert.equal(formatAUD(1234567.8), "$1,234,567.80")
  assert.equal(formatBuyAmount("1,234,567.8912"), "$1,234,567.8912")
})

test("AUD formatters support negative values", () => {
  assert.equal(formatAUD(-1234.5), "-$1,234.50")
  assert.equal(formatBuyAmount("-1234.5678"), "-$1,234.5678")
})
