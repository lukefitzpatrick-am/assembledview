/**
 * ExpertGrid Unit Rate cell: currency when idle, raw number while editing.
 *
 * Display-only. Commit parses with parseMoneyInput and does not round.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { formatRate } from "../../format/money.js"
import {
  commitUnitRateInput,
  formatUnitRateCellValue,
} from "../expertGridUnitRateDisplay.js"

test("unfocused Unit Rate shows currency with min 2 / max 4 decimals", () => {
  assert.equal(formatUnitRateCellValue(12.5, false), "$12.50")
  assert.equal(formatUnitRateCellValue(12.5, false), formatRate(12.5))
})

test("focused Unit Rate shows the raw editable number", () => {
  assert.equal(formatUnitRateCellValue(12.5, true), "12.5")
})

test("typing 0.0234 then blur displays $0.0234 and stores unrounded 0.0234", () => {
  assert.equal(formatUnitRateCellValue("0.0234", true), "0.0234")
  const stored = commitUnitRateInput("0.0234")
  assert.equal(stored, 0.0234)
  assert.equal(formatUnitRateCellValue(stored, false), "$0.0234")
})

test("paste $1,250.00 on commit stores 1250, not a formatted string", () => {
  const stored = commitUnitRateInput("$1,250.00")
  assert.equal(stored, 1250)
  assert.equal(String(stored).includes("$"), false)
})

test("empty Unit Rate stays empty, not $0.00", () => {
  assert.equal(formatUnitRateCellValue("", false), "")
  assert.equal(formatUnitRateCellValue(undefined, false), "")
  assert.equal(formatUnitRateCellValue(null, false), "")
  assert.equal(commitUnitRateInput(""), "")
  assert.equal(commitUnitRateInput("   "), "")
})

test("never reformats mid-keystroke while focused", () => {
  assert.equal(formatUnitRateCellValue("12.", true), "12.")
  assert.equal(formatUnitRateCellValue("12.5", true), "12.5")
})

test("commit does not round the underlying number", () => {
  assert.equal(commitUnitRateInput("1.23456"), 1.23456)
})
