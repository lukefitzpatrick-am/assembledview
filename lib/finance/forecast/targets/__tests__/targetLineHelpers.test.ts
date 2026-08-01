import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  isTargetStorageConfigured,
  normalizeTargetLine,
  targetLineNaturalKey,
} from "@/lib/finance/forecast/targets/targetLineHelpers"

describe("targetLineHelpers", () => {
  it("validates line/month keys", () => {
    assert.equal(isFinanceForecastLineKey("retainer"), true)
    assert.equal(isFinanceForecastLineKey("not_a_real_line"), false)
    assert.equal(isFinanceForecastMonthKey("july"), true)
    assert.equal(isFinanceForecastMonthKey("jul"), false)
  })

  it("builds natural key", () => {
    assert.equal(
      targetLineNaturalKey({
        client_id: "c1",
        financial_year_start_year: 2025,
        line_key: "retainer",
        month_key: "july",
      }),
      "c1::2025::retainer::july"
    )
  })

  it("normalizes fy / month aliases from PG shape", () => {
    const line = normalizeTargetLine({
      id: 42,
      client_id: "9",
      fy: "2026",
      line_key: "commission",
      month: "march",
      amount: "1200.5",
    })
    assert.ok(line)
    assert.equal(line!.financial_year_start_year, 2026)
    assert.equal(line!.month_key, "march")
    assert.equal(line!.amount, 1200.5)
  })

  it("isTargetStorageConfigured follows DATABASE_URL", () => {
    const prev = process.env.DATABASE_URL
    process.env.DATABASE_URL = "postgres://example"
    assert.equal(isTargetStorageConfigured(), true)
    delete process.env.DATABASE_URL
    assert.equal(isTargetStorageConfigured(), false)
    if (prev === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = prev
  })
})
