import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MASTER_MIRROR_FAILURE_KIND,
  buildMasterMirrorFailurePayload,
  buildXanoMasterMirrorPayload,
} from "../writeMediaPlanMasters"

describe("buildXanoMasterMirrorPayload", () => {
  it("includes explicit PG id for Xano alignment (X9 / X1 caveat)", () => {
    const payload = buildXanoMasterMirrorPayload(10000263, {
      mbaNumber: "x9test001",
      mpClientName: "Acme",
      campaignName: "X9 Campaign",
      campaignStatus: "Draft",
      campaignStartDate: "2026-07-01",
      campaignEndDate: "2026-08-31",
      campaignBudgetDollars: 5000,
    })
    assert.equal(payload.id, 10000263)
    assert.equal(payload.mba_number, "x9test001")
    assert.equal(payload.mp_campaignname, "X9 Campaign")
    assert.equal(payload.version_number, 1)
    assert.equal(payload.mp_campaignbudget, 5000)
  })
})

describe("buildMasterMirrorFailurePayload", () => {
  it("shapes app_notifications payload", () => {
    const p = buildMasterMirrorFailurePayload({
      masterId: 10000263,
      mbaNumber: "x9test001",
      error: "upstream 500",
      at: new Date("2026-08-03T00:00:00.000Z"),
    })
    assert.equal(p.op, "create")
    assert.equal(p.masterId, 10000263)
    assert.equal(p.mbaNumber, "x9test001")
    assert.equal(p.error, "upstream 500")
    assert.equal(p.timestamp, "2026-08-03T00:00:00.000Z")
    assert.equal(p.retried, false)
    assert.equal(MASTER_MIRROR_FAILURE_KIND, "xano_master_mirror_failed")
  })
})
