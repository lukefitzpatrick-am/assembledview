import assert from "node:assert/strict"
import test from "node:test"

import {
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  normalizeTargetLine,
  targetLineNaturalKey,
} from "../targetLineHelpers.js"

const FY = 2025

test("isFinanceForecastLineKey / monthKey reuse booked unions", () => {
  assert.equal(isFinanceForecastLineKey("retainer"), true)
  assert.equal(isFinanceForecastLineKey("not_a_real_line"), false)
  assert.equal(isFinanceForecastMonthKey("july"), true)
  assert.equal(isFinanceForecastMonthKey("jul"), false)
})

test("targetLineNaturalKey matches upsert grain", () => {
  assert.equal(
    targetLineNaturalKey({
      client_id: "c1",
      financial_year_start_year: FY,
      line_key: "retainer",
      month_key: "july",
    }),
    "c1::2025::retainer::july"
  )
})

test("normalizeTargetLine accepts financial_year alias", () => {
  const line = normalizeTargetLine({
    id: "42",
    client_id: "9",
    financial_year: FY,
    line_key: "commission",
    month_key: "march",
    amount: "1200.5",
  })
  assert.ok(line)
  assert.equal(line!.financial_year_start_year, FY)
  assert.equal(line!.amount, 1200.5)
  assert.equal(line!.line_key, "commission")
  assert.equal(line!.month_key, "march")
})
