import assert from "node:assert/strict"
import { test } from "node:test"

import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types"

import {
  adServingStatusToDigestBand,
  buildAdServingDigestCampaignRows,
  buildDigestCampaignRows,
  buildDirectDigestCampaignRows,
  directStatusToDigestBand,
  metricsForSourceRow,
  pillToDigestBand,
  type DigestSourceRow,
} from "../banding"
import { buildPacingDigestEmailHtml, buildPacingDigestSubject } from "../email"

function baseRow(overrides: Partial<DigestSourceRow> = {}): DigestSourceRow {
  return {
    channel: "search",
    mbaNumber: "MBA001",
    clientName: "Acme",
    campaignName: "Brand Always On",
    campaignStatus: "live",
    lineItemId: "acme001SE1",
    lineItemStatus: "on-track",
    totalLineItemBudget: 1000,
    spendToDateLineTotal: 500,
    spendToDateCurrentBurst: 500,
    burstDaysRemaining: 10,
    lineItemStartDate: "2026-07-01",
    lineItemEndDate: "2026-07-20",
    currentBurst: {
      startDate: "2026-07-01",
      endDate: "2026-07-20",
      budget: 1000,
    },
    ...overrides,
  }
}

test("pillToDigestBand maps behind → at-risk", () => {
  assert.equal(pillToDigestBand("behind"), "at-risk")
  assert.equal(pillToDigestBand("ahead"), "ahead")
  assert.equal(pillToDigestBand("on-track"), "on")
  assert.equal(pillToDigestBand("no-data"), "no-data")
})

test("metricsForSourceRow delivered and elapsed", () => {
  const m = metricsForSourceRow(baseRow(), "2026-07-11")
  assert.ok(m.deliveredPct != null)
  assert.equal(Number(m.deliveredPct!.toFixed(2)), 0.5)
  assert.ok(m.timeElapsedPct != null)
  assert.ok(m.timeElapsedPct! > 0 && m.timeElapsedPct! <= 1)
  assert.equal(m.daysLeft, 10)
})

test("buildDigestCampaignRows rolls up and sorts at-risk first", () => {
  const rows = buildDigestCampaignRows(
    [
      baseRow({ lineItemStatus: "on-track", lineItemId: "a" }),
      baseRow({
        lineItemStatus: "behind",
        lineItemId: "b",
        campaignName: "Risk Campaign",
        mbaNumber: "MBA002",
      }),
      baseRow({
        lineItemStatus: "ahead",
        lineItemId: "c",
        campaignName: "Fast",
        mbaNumber: "MBA003",
      }),
    ],
    "2026-07-11",
  )
  assert.equal(rows[0].band, "at-risk")
  assert.equal(rows[0].campaignName, "Risk Campaign")
})

test("digest subject includes at-risk count", () => {
  const subject = buildPacingDigestSubject({
    asOfDate: "2026-07-11",
    builtAt: "2026-07-11T00:00:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: { "at-risk": [], behind: [], on: [], ahead: [], "no-data": [] },
    counts: { atRisk: 3, behind: 0, on: 5, ahead: 2, noData: 1, total: 11 },
  })
  assert.equal(subject, "Pacing digest — 3 at risk, 5 on track, 2 ahead (11 live)")
})

test("directStatusToDigestBand maps existing Direct vocab", () => {
  assert.equal(directStatusToDigestBand("completed_under"), "at-risk")
  assert.equal(directStatusToDigestBand("completed_over"), "ahead")
  assert.equal(directStatusToDigestBand("in_progress"), "on")
  assert.equal(directStatusToDigestBand("completed"), "on")
  assert.equal(directStatusToDigestBand("pending"), "no-data")
  assert.equal(directStatusToDigestBand("mixed"), "no-data")
})

test("adServingStatusToDigestBand maps serving|no-data only", () => {
  assert.equal(adServingStatusToDigestBand("serving"), "on")
  assert.equal(adServingStatusToDigestBand("no-data"), "no-data")
})

test("buildDirectDigestCampaignRows rolls mixed → worst burst band", () => {
  const group: DirectCampaignGroup = {
    mbaNumber: "MBA-D1",
    clientName: "Direct Co",
    campaignName: "Fixed Cost Mixed",
    campaignStatus: "live",
    campaignStartDate: "2026-07-01",
    campaignEndDate: "2026-07-31",
    brand: null,
    totalBudget: 2000,
    totalReported: 1800,
    totalActual: 1500,
    variance: 300,
    lineItems: [
      {
        lineItemId: "d1",
        mbaNumber: "MBA-D1",
        lineItemName: "Line A",
        buyType: "fixed_cost",
        isCurrentlyFixedCost: true,
        wasEverFixedCost: true,
        totalBudget: 2000,
        totalReported: 1800,
        totalActual: 1500,
        variance: 300,
        variancePct: 0.167,
        burstCount: 2,
        burstsDeliveredOver: 1,
        burstsDeliveredUnder: 1,
        lineItemStatus: "mixed",
        bursts: [
          {
            burstIndex: 0,
            startDate: "2026-07-01",
            endDate: "2026-07-15",
            budget: 1000,
            expectedDeliverables: 0,
            actualDeliverables: 0,
            deliveryRatio: 0,
            reportedSpend: 1000,
            actualPlatformSpend: 1200,
            variance: -200,
            status: "completed_over",
          },
          {
            burstIndex: 1,
            startDate: "2026-07-16",
            endDate: "2026-07-31",
            budget: 1000,
            expectedDeliverables: 0,
            actualDeliverables: 0,
            deliveryRatio: 0,
            reportedSpend: 800,
            actualPlatformSpend: 300,
            variance: 500,
            status: "completed_under",
          },
        ],
        daily: [],
      },
    ],
  }

  const rows = buildDirectDigestCampaignRows([group], "2026-07-20")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.band, "at-risk")
  assert.equal(rows[0]!.channel, "direct")
  assert.equal(Number(rows[0]!.deliveredPct!.toFixed(2)), 0.75)
  assert.equal(rows[0]!.lineItemCount, 1)
})

test("buildAdServingDigestCampaignRows averages deliverable progress", () => {
  const base = {
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemNumber: 1,
    xanoRowId: 1,
    campaignStatus: "live",
    campaignStartDate: "2026-07-01",
    campaignEndDate: "2026-07-31",
    brand: null,
    platform: "CM360",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    channelFamily: "digitalDisplay" as const,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    plannedImpressions: 1000,
    plannedClicks: 0,
    impressions: 500,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 10,
    deliverableActual: 500,
    deliverableTarget: 1000,
    deliverableKind: "impressions" as const,
  }

  const sources: AdServingPacingCampaignRow[] = [
    {
      ...base,
      mbaNumber: "MBA-AS1",
      clientName: "Serve Co",
      campaignName: "CM360 Always On",
      lineItemId: "as1",
      lineItemStatus: "serving",
      lineItemStartDate: "2026-07-01",
      lineItemEndDate: "2026-07-31",
      currentBurst: {
        index: 0,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        budget: 0,
        buyAmount: 0,
        calculatedValue: 0,
      },
      deliverableProgress: 0.4,
    },
    {
      ...base,
      mbaNumber: "MBA-AS1",
      clientName: "Serve Co",
      campaignName: "CM360 Always On",
      lineItemId: "as2",
      lineItemNumber: 2,
      lineItemStatus: "no-data",
      lineItemStartDate: "2026-07-01",
      lineItemEndDate: "2026-07-31",
      currentBurst: null,
      deliverableProgress: 0.6,
    },
  ]

  const rows = buildAdServingDigestCampaignRows(sources, "2026-07-11")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.channel, "ad-serving")
  assert.equal(rows[0]!.band, "no-data") // worst of serving(on) + no-data
  assert.equal(Number(rows[0]!.deliveredPct!.toFixed(2)), 0.5)
  assert.equal(rows[0]!.lineItemCount, 2)
})

test("email HTML includes ad-serving deliverable-progress footnote", () => {
  const html = buildPacingDigestEmailHtml({
    asOfDate: "2026-07-11",
    builtAt: "2026-07-11T00:00:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: {
      "at-risk": [
        {
          clientName: "Direct Co",
          mbaNumber: "MBA-D1",
          campaignName: "Under",
          channel: "direct",
          band: "at-risk",
          deliveredPct: 0.5,
          timeElapsedPct: 1,
          daysLeft: 0,
          lineItemCount: 1,
        },
      ],
      behind: [],
      on: [
        {
          clientName: "Serve Co",
          mbaNumber: "MBA-AS1",
          campaignName: "CM360",
          channel: "ad-serving",
          band: "on",
          deliveredPct: 0.4,
          timeElapsedPct: 0.5,
          daysLeft: 10,
          lineItemCount: 2,
        },
      ],
      ahead: [],
      "no-data": [],
    },
    counts: { atRisk: 1, behind: 0, on: 1, ahead: 0, noData: 0, total: 2 },
  })
  assert.match(
    html,
    /Ad-serving: delivered % is deliverable progress \(impressions\/clicks vs plan\); no spend pacing\./,
  )
  assert.match(html, /\(direct\)/)
  assert.match(html, /\(ad-serving\)/)
})
