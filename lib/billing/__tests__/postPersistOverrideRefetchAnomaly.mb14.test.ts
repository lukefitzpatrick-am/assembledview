import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  BILLING_OVERRIDES_REFETCH_ANOMALY_AUDIENCE,
  BILLING_OVERRIDES_REFETCH_ANOMALY_KIND,
  buildBillingOverridesRefetchAnomalyPayload,
  decidePostPersistOverrideMetaUpdate,
} from "@/lib/billing/postPersistOverrideRefetchAnomaly.js"

describe("MB-14 post-persist override refetch anomaly", () => {
  it("persist success + empty refetch → retain prior meta and report anomaly", () => {
    const decision = decidePostPersistOverrideMetaUpdate({
      metaByLineSize: 0,
      refetchRowCount: 0,
    })
    assert.equal(decision.retainPriorMeta, true)
    assert.equal(decision.shouldReportAnomaly, true)
    assert.equal(decision.reason, "empty_after_persist")

    const payload = buildBillingOverridesRefetchAnomalyPayload({
      versionId: 1162,
      mba: "supabase001",
      reason: decision.reason!,
      replacedMedia: 1,
      replacedFee: 1,
      reset: 0,
      refetchRowCount: 0,
      retainedPriorMeta: decision.retainPriorMeta,
      at: new Date("2026-08-02T02:00:00.000Z"),
    })

    assert.equal(BILLING_OVERRIDES_REFETCH_ANOMALY_KIND, "billing_overrides_refetch_anomaly")
    assert.equal(BILLING_OVERRIDES_REFETCH_ANOMALY_AUDIENCE, "admin")
    assert.deepEqual(payload, {
      versionId: 1162,
      mba: "supabase001",
      reason: "empty_after_persist",
      replacedMedia: 1,
      replacedFee: 1,
      reset: 0,
      refetchRowCount: 0,
      retainedPriorMeta: true,
      timestamp: "2026-08-02T02:00:00.000Z",
    })
  })

  it("refetch throw → retain prior meta and report anomaly", () => {
    const decision = decidePostPersistOverrideMetaUpdate({
      refetchThrew: true,
      errorMessage: "Failed to load billing overrides (500)",
    })
    assert.equal(decision.retainPriorMeta, true)
    assert.equal(decision.shouldReportAnomaly, true)
    assert.equal(decision.reason, "refetch_threw")

    const payload = buildBillingOverridesRefetchAnomalyPayload({
      versionId: "1162",
      mba: "supabase001",
      reason: "refetch_threw",
      replacedMedia: 2,
      replacedFee: 0,
      reset: 1,
      error: "Failed to load billing overrides (500)",
      retainedPriorMeta: true,
      at: new Date("2026-08-02T03:00:00.000Z"),
    })
    assert.equal(payload.reason, "refetch_threw")
    assert.equal(payload.error, "Failed to load billing overrides (500)")
    assert.equal(payload.retainedPriorMeta, true)
  })

  it("non-empty meta → adopt refetch meta, no anomaly", () => {
    const decision = decidePostPersistOverrideMetaUpdate({
      metaByLineSize: 2,
      refetchRowCount: 2,
    })
    assert.equal(decision.retainPriorMeta, false)
    assert.equal(decision.shouldReportAnomaly, false)
    assert.equal(decision.reason, undefined)
  })
})
