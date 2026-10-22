/** CPV target is always the plan CPV; saved CPV is never read (Luke, 23 Oct 2026). */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { DeliveryChannelGroup } from "@/lib/ava/tools/summaries"
import { groupsFromDeliverySnapshot, planLineFromSnapshot } from "@/lib/campaign-read/kpiRead"
import { buildKpiReview, extractKpiReviewPlanLine } from "@/lib/kpi/kpiReview"
import type { CampaignKPI, ResolvedKPIRow } from "@/lib/kpi/types"
import { programmaticFixture, searchFixture, socialFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { buildResolvedKpiRowFromPacing } from "@/lib/pacing/kpi/buildResolvedRow"
import { buildSyncPayloadFromEditedRow } from "@/lib/pacing/kpi/buildSyncPayload"
import { applySyncedTargetsToRow } from "@/lib/pacing/kpi/applySyncedTargets"
import { computeProgrammaticRowKpiStatus } from "@/lib/pacing/programmatic/computeProgrammaticKpiStatus"
import { computeSocialRowKpiStatus } from "@/lib/pacing/social/computeSocialKpiStatus"
import { buildKpiRows } from "@/lib/reports/campaignReport/kpiRows"

function savedKpi(overrides: Partial<CampaignKPI> = {}): CampaignKPI {
  return {
    mp_client_name: "Bic",
    mba_number: "BICAU002",
    version_number: 28,
    campaign_name: "Bic",
    media_type: "progVideo",
    publisher: "channel factory",
    bid_strategy: "completed_views",
    line_item_id: "bicau002pv1",
    ctr: null,
    cpv: 0.5,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...overrides,
  }
}

describe("pacing KPI pill", () => {
  it("a line with a plan CPV and no saved KPI row is not KPI pending", () => {
    const social = socialFixture({ kpiTargets: null, planCpvRate: 0.09, cpv: 0.08 })
    assert.notEqual(computeSocialRowKpiStatus(social), "kpi-pending")
    assert.equal(computeSocialRowKpiStatus(social), "kpi-on-track")
    const prog = programmaticFixture({ kpiTargets: null, planCpvRate: 0.09, cpv: 0.2 })
    assert.equal(computeProgrammaticRowKpiStatus(prog), "kpi-off-target")
  })

  it("no saved row and no plan CPV is still KPI pending", () => {
    assert.equal(computeSocialRowKpiStatus(socialFixture({ kpiTargets: null, planCpvRate: null })), "kpi-pending")
  })
})

describe("saved CPV is never read or written", () => {
  it("pacing KPI editor rows and sync payloads carry no CPV", () => {
    const row = searchFixture({
      kpiTargets: {
        mediaType: "search",
        publisher: "google",
        bidStrategy: null,
        ctr: 0.02,
        cpv: 0.5,
        conversionRate: null,
        vtr: null,
        frequency: null,
      },
    })
    const resolved = buildResolvedKpiRowFromPacing(row)
    assert.equal(resolved.cpv, null)
    const payload = buildSyncPayloadFromEditedRow({ ...resolved, cpv: 0.5 } as ResolvedKPIRow)
    assert.equal(payload.cpv, null)
    assert.equal(applySyncedTargetsToRow(savedKpi()).cpv, null)
  })

  it("the deck KPI table has no saved CPV row", () => {
    const rows = buildKpiRows([savedKpi({ ctr: 0.004 })], { impressions: 1_000, clicks: 5, results: 0, spend: 100 })
    assert.deepEqual(
      rows.map((r) => r.metric),
      ["ctr"],
    )
  })
})

describe("campaign read CPV uses the plan rate", () => {
  // BICAU002PV1: Channel Factory CPV buy, $16,000 at $0.09.
  const bursts = [
    { startDate: "2026-08-05", endDate: "2026-10-25", budget: "$16,000.00", buyAmount: "$0.09", calculatedValue: "177778" },
  ]
  const planBuyRate = extractKpiReviewPlanLine({ bursts, buy_type: "cpv" }, 16_000).buyAmount

  it("the plan buy rate comes off the bursts", () => {
    assert.equal(planBuyRate, 0.09)
  })

  it("the review CPV row reads the plan rate, ignoring the saved $0.50", () => {
    const channels = [
      {
        group: "programmatic_video",
        lines: [
          {
            lineItemId: "bicau002pv1",
            name: "bicau002pv1",
            plannedBudget: 16_000,
            plannedUnits: null,
            plannedViews: 177_778,
            buyType: "cpv",
            planBuyRate,
            startDate: "2026-08-05",
            endDate: "2026-10-25",
            spendToDate: 9_000,
            impressions: 400_000,
            clicks: 100,
            results: 0,
            video3sViews: 120_000,
            cpm: null,
            ctr: null,
            cpc: null,
            noDeliveryRows: false,
            deliveryState: "reported",
          },
        ],
      },
    ] as unknown as DeliveryChannelGroup[]
    assert.equal(planLineFromSnapshot(channels[0]!.lines[0]!).buyAmount, 0.09)
    const groups = groupsFromDeliverySnapshot(channels)
    const lineItemTargets = new Map([["BICAU002|28|bicau002pv1", savedKpi()]])
    const cards = buildKpiReview({ groups, lineItemTargets, isAdmin: true })
    const cpvRow = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(cpvRow?.targetDisplay, "$0.09")
    assert.equal(cpvRow?.targetCaption, "plan rate")
    // Delivered $9,000 / 120,000 views = $0.075.
    assert.equal(cpvRow?.deliveredDisplay, "$0.08")
  })
})
