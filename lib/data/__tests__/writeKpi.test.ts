import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  KPI_MIRROR_FAILURE_KIND,
  assertKpiPercentDecimal,
  buildKpiMirrorFailurePayload,
  campaignKpiLineKey,
  pickNewestCampaignKpi,
  resolveCampaignKpiUpsert,
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

describe("campaign_kpi upsert key", () => {
  it("folds mba and line_item_id case so twins share one key", () => {
    assert.equal(
      campaignKpiLineKey("BICAU002", 28, "bicau002SM1"),
      campaignKpiLineKey("bicau002", 28, "BICAU002sm1"),
    )
  })

  it("picks the newest row (created_at, then id) when twins exist", () => {
    const newest = pickNewestCampaignKpi([
      { id: 10, created_at: "2026-01-01T00:00:00.000Z" },
      { id: 12, created_at: "2026-01-02T00:00:00.000Z" },
      { id: 11, created_at: "2026-01-02T00:00:00.000Z" },
    ])
    assert.equal(newest?.id, 12)
  })

  it("inserts when no existing row; updates the newest when one exists", () => {
    assert.deepEqual(resolveCampaignKpiUpsert([]), { action: "insert" })
    assert.deepEqual(
      resolveCampaignKpiUpsert([{ id: 7, created_at: "2026-01-01T00:00:00.000Z" }]),
      { action: "update", id: 7 },
    )
  })
})
