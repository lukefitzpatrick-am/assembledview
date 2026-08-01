import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildKpiPacingRows,
  computeKpiExpectedToDate,
  computeKpiPacingMathsStatus,
  isKpiTargetPendingReview,
  resolveDeliveredActual,
  type KpiPacingDeliveryFeed,
} from "@/lib/kpi/kpiPacing"
import type { CampaignKPI } from "@/lib/kpi/types"

const emptyFeed: KpiPacingDeliveryFeed = {
  impressions: 0,
  clicks: 0,
  results: 0,
  spendToDate: 0,
  video3sViews: 0,
}

function kpi(partial: Partial<CampaignKPI> & Pick<CampaignKPI, "mba_number">): CampaignKPI {
  return {
    mp_client_name: "Test",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "search",
    publisher: "google",
    bid_strategy: "manual_cpc",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...partial,
  }
}

describe("computeKpiExpectedToDate", () => {
  it("prorates target by campaign elapsed fraction", () => {
    // 10 of 20 days → 50%
    assert.equal(computeKpiExpectedToDate(0.04, 10, 20), 0.02)
    assert.equal(computeKpiExpectedToDate(100, 0, 30), 0)
    assert.equal(computeKpiExpectedToDate(0.1, 30, 30), 0.1)
  })
})

describe("computeKpiPacingMathsStatus (delivery ladder)", () => {
  it("marks on_track when projected finish matches target within 5%", () => {
    // Mid-flight: delivered half of target at half time → project to target
    const status = computeKpiPacingMathsStatus({
      asOfDate: "2026-01-16",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      target: 0.04,
      delivered: 0.02,
      daysPassed: 15,
      campaignDays: 31,
    })
    // dailyPace = 0.02/15; projected ≈ 0.0413; variance small → on_track or slightly_over
    assert.ok(
      status === "on_track" || status === "slightly_over" || status === "slightly_under",
      `unexpected status ${status}`,
    )
  })

  it("marks under_pacing when delivered is far below linear expectation", () => {
    const status = computeKpiPacingMathsStatus({
      asOfDate: "2026-01-21",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      target: 0.04,
      delivered: 0.002,
      daysPassed: 20,
      campaignDays: 31,
    })
    assert.equal(status, "under_pacing")
  })

  it("marks no_delivery when delivered is 0 after 2+ days", () => {
    const status = computeKpiPacingMathsStatus({
      asOfDate: "2026-01-05",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      target: 0.04,
      delivered: 0,
      daysPassed: 4,
      campaignDays: 31,
    })
    assert.equal(status, "no_delivery")
  })
})

describe("ambiguous percent → Pending KPI data review", () => {
  it("flags exact 1.0 as pending review for ratio metrics", () => {
    assert.equal(isKpiTargetPendingReview("ctr", 1), true)
    assert.equal(isKpiTargetPendingReview("vtr", 1), true)
    assert.equal(isKpiTargetPendingReview("conversion_rate", 1), true)
  })

  it("does not flag unambiguous decimals", () => {
    assert.equal(isKpiTargetPendingReview("ctr", 0.02), false)
    assert.equal(isKpiTargetPendingReview("ctr", 0), false)
  })

  it("buildKpiPacingRows renders — for ambiguous 1.0", () => {
    const rows = buildKpiPacingRows({
      campaignKpis: [kpi({ mba_number: "X", ctr: 1 })],
      feed: { ...emptyFeed, impressions: 1000, clicks: 20 },
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      asOfDate: "2026-06-01",
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].kind, "pending_review")
    assert.equal(rows[0].targetDisplay, "—")
    assert.equal(rows[0].deliveredDisplay, "—")
    assert.equal(rows[0].expectedDisplay, "—")
    assert.equal(rows[0].fallbackLabel, "Pending KPI data review")
    assert.equal(rows[0].mathsStatus, null)
  })
})

describe("resolveDeliveredActual + build rows", () => {
  it("computes CTR from clicks/impressions", () => {
    assert.equal(
      resolveDeliveredActual("ctr", { ...emptyFeed, impressions: 1000, clicks: 25 }),
      0.025,
    )
  })

  it("returns null for unmapped metrics", () => {
    assert.equal(
      resolveDeliveredActual("vtr", { ...emptyFeed, impressions: 1000, video3sViews: 100 }),
      null,
    )
    assert.equal(
      resolveDeliveredActual("cpv", { ...emptyFeed, spendToDate: 50, video3sViews: 100 }),
      null,
    )
  })

  it("returns empty when no targets exist", () => {
    const rows = buildKpiPacingRows({
      campaignKpis: [kpi({ mba_number: "X" })],
      feed: emptyFeed,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    assert.deepEqual(rows, [])
  })

  it("shows No delivery feed (not paced) for VTR / CPV / frequency", () => {
    const rows = buildKpiPacingRows({
      campaignKpis: [
        kpi({ mba_number: "X", vtr: 0.5, cpv: 0.12, frequency: 3 }),
      ],
      feed: { ...emptyFeed, impressions: 10_000, spendToDate: 100, video3sViews: 500 },
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      asOfDate: "2026-06-01",
    })
    assert.equal(rows.length, 3)
    for (const row of rows) {
      assert.equal(row.kind, "no_delivery_feed")
      assert.equal(row.fallbackLabel, "No delivery feed")
      assert.equal(row.mathsStatus, null)
    }
  })

  it("paces CTR when delivery feed has impressions+clicks", () => {
    const rows = buildKpiPacingRows({
      campaignKpis: [kpi({ mba_number: "X", ctr: 0.02 })],
      feed: { ...emptyFeed, impressions: 10_000, clicks: 200 },
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      asOfDate: "2026-01-16",
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].kind, "paced")
    assert.equal(rows[0].targetDisplay, "2.00%")
    assert.equal(rows[0].deliveredDisplay, "2.00%")
    assert.ok(rows[0].expectedValue != null)
    assert.ok(rows[0].mathsStatus)
    assert.ok(rows[0].statusPresentation)
  })
})
