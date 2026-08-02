import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  KPI_MIRROR_FAILURE_KIND,
  assertKpiPercentDecimal,
  buildKpiMirrorFailurePayload,
} from "../writeKpi"

describe("assertKpiPercentDecimal", () => {
  it("allows decimal ≤1 and null", () => {
    assert.equal(assertKpiPercentDecimal("ctr", 0.45), 0.45)
    assert.equal(assertKpiPercentDecimal("ctr", 1), 1)
    assert.equal(assertKpiPercentDecimal("ctr", null), null)
  })

  it("rejects percentage-point magnitudes (banned heuristic path)", () => {
    assert.throws(() => assertKpiPercentDecimal("ctr", 45), /decimal ≤1/)
    assert.throws(() => assertKpiPercentDecimal("vtr", 100), /decimal ≤1/)
  })

  it("does not apply percent gate to cpv", () => {
    assert.equal(assertKpiPercentDecimal("cpv", 12.5), 12.5)
  })
})

describe("buildKpiMirrorFailurePayload", () => {
  it("shapes app_notifications payload", () => {
    const p = buildKpiMirrorFailurePayload({
      op: "create",
      table: "campaign_kpi",
      rowId: 7,
      error: "upstream",
      at: new Date("2026-08-02T00:00:00.000Z"),
    })
    assert.equal(p.table, "campaign_kpi")
    assert.equal(p.timestamp, "2026-08-02T00:00:00.000Z")
    assert.equal(KPI_MIRROR_FAILURE_KIND, "xano_kpi_mirror_failed")
  })
})
