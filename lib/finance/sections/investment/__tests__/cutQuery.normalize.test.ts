import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  investmentCutSqlText,
  normalizeInvestmentCutRequest,
} from "@/lib/finance/sections/investment/cutQuery"
import {
  FEE_COVERAGE_CAVEAT,
  FEE_COVERAGE_USER_NOTICE,
} from "@/lib/finance/sections/investment/cutTypes"

describe("normalizeInvestmentCutRequest", () => {
  it("rejects mixed/invalid basis", () => {
    const bad = normalizeInvestmentCutRequest({
      fy: 2025,
      basis: "booked" as "billing",
      dimensions: [],
      measures: ["billable_cents"],
    })
    assert.ok("error" in bad)
  })

  it("clamps month range into FY and defaults booked measures (not Actuals)", () => {
    const q = normalizeInvestmentCutRequest(
      {
        fy: 2025,
        basis: "billing",
        monthRange: { from: "2025-07", to: "2026-06" },
        dimensions: ["client"],
        measures: [],
      },
      new Date("2026-01-15T00:00:00+11:00")
    )
    assert.ok(!("error" in q))
    if ("error" in q) return
    assert.equal(q.from, "2025-07")
    assert.ok(q.measures.includes("billable_cents"))
    assert.ok(q.measures.includes("fee_cents"))
    assert.ok(!q.measures.includes("invoiced_cents"))
  })

  it("returns ACTUALS_GRAIN_UNSUPPORTED for publisher + invoiced", () => {
    const q = normalizeInvestmentCutRequest({
      fy: 2025,
      basis: "billing",
      dimensions: ["publisher"],
      measures: ["invoiced_cents"],
    })
    assert.ok("error" in q)
    if (!("error" in q)) return
    assert.equal(q.error, "ACTUALS_GRAIN_UNSUPPORTED")
  })

  it("builds MCP-ready SQL with single basis and fee caveat constant", () => {
    const q = normalizeInvestmentCutRequest({
      fy: 2025,
      basis: "delivery",
      monthRange: { from: "2025-07", to: "2025-12" },
      dimensions: ["client"],
      measures: ["billable_cents", "fee_cents"],
      filters: { clients: [1, 2], search: "acme" },
    })
    assert.ok(!("error" in q))
    if ("error" in q) return
    const sql = investmentCutSqlText(q)
    assert.match(sql.cut, /sm\.basis = 'delivery'/)
    assert.doesNotMatch(sql.cut, /sm\.basis = 'billing'/)
    assert.match(sql.cut, /client_pays_for_media/)
    assert.match(sql.feeCoverage, /has_fee/)
    assert.match(FEE_COVERAGE_CAVEAT, /mba_fee_snapshots/)
    assert.match(FEE_COVERAGE_USER_NOTICE, /fee snapshots/i)
    assert.doesNotMatch(FEE_COVERAGE_USER_NOTICE, /O4\.5/)
  })
})
