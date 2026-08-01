import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  actualsBlockedReasonForDim,
  grainRuleMatrix,
  validateActualsGrain,
  type ActualsGrainViolation,
} from "@/lib/finance/sections/investment/cutGrain"
import { measurePickerState } from "@/lib/finance/sections/investment/measureCatalog"

describe("cutGrain actuals rules", () => {
  it("allows Actuals for client/month/fy (and empty dims)", () => {
    for (const dimensions of [[], ["client"], ["month"], ["fy"], ["client", "month"]] as const) {
      const r = validateActualsGrain({
        dimensions: [...dimensions],
        measures: ["invoiced_cents", "billable_cents"],
      })
      assert.deepEqual(r, { ok: true }, `dims=${dimensions.join(",")}`)
    }
  })

  it("refuses Actuals for publisher/channel with typed message", () => {
    const r = validateActualsGrain({
      dimensions: ["channelGroup", "publisher"],
      measures: ["invoiced_cents"],
    })
    assert.equal("ok" in r && r.ok, false)
    if ("ok" in r && r.ok) return
    const v = r as ActualsGrainViolation
    assert.equal(v.code, "ACTUALS_GRAIN_UNSUPPORTED")
    assert.equal(v.error, "ACTUALS_GRAIN_UNSUPPORTED")
    assert.match(v.message, /publisher/i)
    assert.ok(v.blockedDimensions.includes("publisher"))
  })

  it("refuses Actuals when line-level filters are set", () => {
    const r = validateActualsGrain({
      dimensions: ["client"],
      measures: ["paid_cents"],
      filters: { publishers: ["Nine"] },
    })
    assert.equal("ok" in r && r.ok, false)
    if ("ok" in r && r.ok) return
    const v = r as ActualsGrainViolation
    assert.ok(v.blockedFilters.includes("publishers"))
  })

  it("documents grain matrix: Actuals only on MBA-month dims", () => {
    const matrix = grainRuleMatrix()
    const byPub = matrix.find(
      (x) => x.dim === "publisher" && x.measure === "invoiced_cents"
    )
    const byClient = matrix.find(
      (x) => x.dim === "client" && x.measure === "invoiced_cents"
    )
    const mediaPub = matrix.find(
      (x) => x.dim === "publisher" && x.measure === "media_cents"
    )
    assert.equal(byPub?.allowed, false)
    assert.equal(byClient?.allowed, true)
    assert.equal(mediaPub?.allowed, true)
  })

  it("measure picker disables Actuals with explanation (not hidden)", () => {
    const items = measurePickerState(["channelGroup", "publisher"])
    const actuals = items.filter((i) => i.group === "actuals")
    assert.equal(actuals.length, 3)
    for (const a of actuals) {
      assert.equal(a.disabled, true)
      assert.ok(a.disabledReason)
      assert.match(a.disabledReason!, /line detail/i)
    }
    const booked = items.filter((i) => i.group === "booked")
    assert.ok(booked.every((b) => !b.disabled))
    const agency = items.filter((i) => i.group === "agency")
    assert.ok(agency.length >= 4)
    assert.ok(agency.every((a) => a.disabled && a.disabledReason))
  })

  it("publisher blocked reason is honest copy", () => {
    assert.match(
      actualsBlockedReasonForDim("publisher"),
      /Invoiced actuals aren't available by publisher/
    )
  })
})
