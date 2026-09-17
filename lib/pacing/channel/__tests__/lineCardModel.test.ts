import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  lineCardFromAdServing,
  lineCardFromDirect,
  lineCardFromProgrammatic,
  lineCardFromSearch,
  lineCardFromSocial,
} from "../lineCardModel.js"
import {
  LINE_AS_OF,
  adServingFixture,
  directGroupFixture,
  programmaticFixture,
  searchFixture,
  socialFixture,
} from "./fixtures.js"

describe("lineCardFromSearch", () => {
  it("maps identity, search metrics, KPI chips and a September burst clause", () => {
    const model = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    assert.equal(model.client, "Jayco")
    assert.equal(model.lineItemId, "jayco001se1")
    assert.equal(model.platform, "Google Ads")
    assert.ok(model.timePct > 0)
    assert.ok(model.linePct > 0)
    assert.ok(model.burstPct != null)
    assert.equal(model.metrics[0]?.label, "Clicks")
    assert.equal(model.metrics[1]?.label, "Conversions")
    assert.ok(model.kpis.some((kpi) => kpi.label === "CTR"))
    assert.match(model.why, /September burst is \d+% of expected with \d+ days left/)
    assert.equal(model.spendMode, "actual")
    assert.equal(model.bursts.states.filter((state) => state === "now").length, 1)
  })

  it("marks KPI pending when no targets are saved", () => {
    const model = lineCardFromSearch(searchFixture({ kpiTargets: null }), LINE_AS_OF)
    assert.equal(model.kpiStatus, "kpi-pending")
  })
})

describe("lineCardFromSocial", () => {
  it("includes impressions, CTR, CPM and 3s views on a video buy", () => {
    const model = lineCardFromSocial(socialFixture(), LINE_AS_OF)
    const labels = model.metrics.map((metric) => metric.label)
    assert.ok(labels.includes("Impressions"))
    assert.ok(labels.includes("CTR"))
    assert.ok(labels.includes("CPM"))
    assert.ok(labels.includes("3s views"))
    assert.ok(model.why.includes("burst is"))
  })
})

describe("lineCardFromProgrammatic", () => {
  it("uses impressions + CPM and an actual spend-mode chip", () => {
    const model = lineCardFromProgrammatic(programmaticFixture(), LINE_AS_OF)
    const labels = model.metrics.map((metric) => metric.label)
    assert.ok(labels.includes("Impressions"))
    assert.ok(labels.includes("CPM"))
    assert.equal(model.spendMode, "actual")
    assert.ok(model.metrics.some((metric) => metric.label === "Spend mode" && metric.value === "actual"))
  })

  it("labels reported spend when the line is deferred to Direct", () => {
    const model = lineCardFromProgrammatic(
      programmaticFixture({ spendPacingDeferredToDirect: true, fixedCostMedia: true }),
      LINE_AS_OF,
    )
    assert.equal(model.spendMode, "reported")
  })
})

describe("lineCardFromAdServing", () => {
  it("keeps ZERO-$ spend and flags verification only", () => {
    const model = lineCardFromAdServing(adServingFixture(), LINE_AS_OF)
    assert.equal(model.spend, 0)
    assert.equal(model.budget, 0)
    assert.equal(model.verificationOnly, true)
    assert.equal(model.spendMode, null)
    assert.equal(model.metrics[0]?.label, "Served impressions")
    assert.ok(model.kpis.some((kpi) => kpi.label === "Verification only"))
  })
})

describe("lineCardFromDirect", () => {
  it("uses reported vs actual and the in-progress burst", () => {
    const group = directGroupFixture()
    const model = lineCardFromDirect(group, group.lineItems[0]!, LINE_AS_OF)
    assert.equal(model.spend, 18_000)
    assert.equal(model.budget, 40_000)
    assert.equal(model.spendMode, "reported")
    assert.equal(model.metrics[0]?.label, "Reported")
    assert.equal(model.metrics[2]?.label, "Buy type")
    assert.equal(model.burstSpend, 6_000)
    assert.match(model.why, /September burst/)
  })
})
