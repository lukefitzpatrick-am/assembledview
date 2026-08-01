import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  AGENCY_ECONOMICS_PRESETS,
  composeAgencyRevenueCents,
  INCLUDE_ADSERVING_IN_AGENCY_REVENUE,
  marginPct,
  monthsInRange,
  validateAgencyEconomicsFy,
  validateAgencyRevenueGrain,
  type AgencyEconomicsHistoricError,
} from "@/lib/finance/sections/investment/agencyEconomics"
import type { AgencyRevenueGrainError } from "@/lib/finance/sections/investment/cutQuery"
import { normalizeInvestmentCutRequest } from "@/lib/finance/sections/investment/cutQuery"

describe("agencyEconomics marginPct", () => {
  it("guards divide-by-zero", () => {
    assert.equal(marginPct(100, 0), null)
    assert.equal(marginPct(100, NaN), null)
  })

  it("returns one-decimal percent", () => {
    assert.equal(marginPct(2500, 10000), 25)
    assert.equal(marginPct(1, 3), 33.3)
  })
})

describe("agencyEconomics revenue compose", () => {
  it("excludes adserving by default (Luke open)", () => {
    assert.equal(INCLUDE_ADSERVING_IN_AGENCY_REVENUE, false)
    assert.equal(
      composeAgencyRevenueCents({
        feeCents: 100,
        retainerCents: 50,
        sowCents: 0,
        adservingCents: 999,
      }),
      150
    )
  })
})

describe("agencyEconomics monthsInRange", () => {
  it("counts inclusive months for retainer multiply", () => {
    assert.deepEqual(monthsInRange("2026-07", "2026-09"), ["2026-07", "2026-08", "2026-09"])
  })
})

describe("agencyEconomics FY gate", () => {
  const today = new Date("2026-08-01T00:00:00+10:00")

  it("blocks historic FY when agency measures requested", () => {
    const r = validateAgencyEconomicsFy({
      fy: 2025,
      measures: ["revenue_cents"],
      today,
    })
    assert.ok(!("ok" in r && r.ok))
    if ("ok" in r && r.ok) return
    assert.equal(
      (r as AgencyEconomicsHistoricError).error,
      "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"
    )
  })

  it("blocks historic FY for fee-only preset id", () => {
    const r = validateAgencyEconomicsFy({
      fy: 2025,
      measures: ["billable_cents", "fee_cents"],
      presetId: "where-the-money-is",
      today,
    })
    assert.ok(!("ok" in r && r.ok))
  })

  it("allows current FY", () => {
    const r = validateAgencyEconomicsFy({
      fy: 2026,
      measures: ["margin_pct"],
      today,
    })
    assert.deepEqual(r, { ok: true })
  })
})

describe("agencyEconomics revenue grain", () => {
  it("refuses publisher + revenue", () => {
    const r = validateAgencyRevenueGrain({
      dimensions: ["publisher"],
      measures: ["revenue_cents"],
    })
    assert.ok(!("ok" in r && r.ok))
    if ("ok" in r && r.ok) return
    assert.equal(
      (r as AgencyRevenueGrainError).error,
      "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
    )
  })

  it("allows client + month", () => {
    const r = validateAgencyRevenueGrain({
      dimensions: ["client", "month"],
      measures: ["retainer_cents", "margin_pct"],
    })
    assert.deepEqual(r, { ok: true })
  })
})

describe("normalizeInvestmentCutRequest agency gates", () => {
  const today = new Date("2026-08-01T00:00:00+10:00")

  it("returns AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED", () => {
    const q = normalizeInvestmentCutRequest(
      {
        fy: 2025,
        basis: "billing",
        dimensions: ["client"],
        measures: ["revenue_cents", "fee_cents"],
      },
      today
    )
    assert.ok("error" in q)
    if (!("error" in q)) return
    assert.equal(q.error, "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED")
  })

  it("returns AGENCY_REVENUE_GRAIN_UNSUPPORTED for billingAgency", () => {
    const q = normalizeInvestmentCutRequest(
      {
        fy: 2026,
        basis: "billing",
        dimensions: ["client", "billingAgency"],
        measures: ["revenue_cents"],
      },
      today
    )
    assert.ok("error" in q)
    if (!("error" in q)) return
    assert.equal(q.error, "AGENCY_REVENUE_GRAIN_UNSUPPORTED")
  })

  it("accepts client profitability preset shape on current FY", () => {
    const preset = AGENCY_ECONOMICS_PRESETS[0]!
    const q = normalizeInvestmentCutRequest(
      {
        fy: 2026,
        basis: preset.basis,
        dimensions: preset.cut.dimensions,
        measures: preset.cut.measures,
        presetId: preset.id,
      },
      today
    )
    assert.ok(!("error" in q))
  })
})
