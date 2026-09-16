import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SearchPacingCampaignRow } from "../../campaigns/types.js"
import type { SocialPacingCampaignRow } from "../../social/types.js"
import type { ProgrammaticPacingCampaignRow } from "../../programmatic/types.js"
import type { AdServingPacingCampaignRow } from "../../ad-serving/types.js"
import {
  assembleCampaignPacingRows,
  countPortfolioRows,
} from "../assembleCampaignPacingRows.js"
import type { CampaignScheduleInput } from "../types.js"

const AS_OF = "2026-09-16"
const START = "2026-07-01"
const END = "2026-12-31"

function julySchedule(amount: number): CampaignScheduleInput["deliverySchedule"] {
  const dollars = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  })
  return [
    {
      month: "July 2026",
      mediaCosts: { search: dollars },
      mediaTotal: dollars,
      feeTotal: "$0.00",
      totalAmount: dollars,
    },
  ]
}

function schedule(mba: string, expected: number, budget: number): [string, CampaignScheduleInput] {
  return [
    mba.toLowerCase(),
    {
      deliverySchedule: julySchedule(expected),
      campaignBudget: budget,
    },
  ]
}

function search(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItemId: string
  spend: number
  budget: number
  impressions?: number
  kpi?: boolean
}): SearchPacingCampaignRow {
  return {
    mbaNumber: partial.mbaNumber,
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId: partial.lineItemId,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: partial.clientName,
    campaignName: partial.campaignName,
    campaignStatus: "booked",
    campaignStartDate: START,
    campaignEndDate: END,
    brand: null,
    platform: "google",
    bidStrategy: "",
    buyType: "cpc",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    lineItemStartDate: START,
    lineItemEndDate: END,
    totalLineItemBudget: partial.budget,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    currentBurst: null,
    lineItemStatus: "on-track",
    burstDays: null,
    burstDaysRemaining: null,
    spendPerDayRemaining: null,
    spendRemainingCurrentBurst: null,
    spendRemainingLineTotal: null,
    spendToDateLineTotal: partial.spend,
    spendToDateCurrentBurst: partial.spend,
    spendYesterday: 0,
    impressions: partial.impressions ?? (partial.spend > 0 ? 1000 : 0),
    clicks: 0,
    conversions: 0,
    revenue: 0,
    cpc: null,
    ctr: null,
    cpm: null,
    kpiTargets: partial.kpi
      ? {
          mediaType: "search",
          publisher: null,
          bidStrategy: null,
          ctr: 2,
          cpv: null,
          conversionRate: null,
          vtr: null,
          frequency: null,
        }
      : null,
    platformCampaigns: [],
  }
}

function social(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItemId: string
  spend: number
  budget: number
}): SocialPacingCampaignRow {
  return {
    mbaNumber: partial.mbaNumber,
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId: partial.lineItemId,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: partial.clientName,
    campaignName: partial.campaignName,
    campaignStatus: "booked",
    campaignStartDate: START,
    campaignEndDate: END,
    brand: null,
    platform: "meta",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    socialPlatform: "meta",
    deliverableMetric: "IMPRESSIONS",
    deliverableTarget: 10_000,
    lineItemStartDate: START,
    lineItemEndDate: END,
    totalLineItemBudget: partial.budget,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    currentBurst: null,
    lineItemStatus: "on-track",
    burstDays: null,
    burstDaysRemaining: null,
    spendPerDayRemaining: null,
    spendRemainingCurrentBurst: null,
    spendRemainingLineTotal: null,
    spendToDateLineTotal: partial.spend,
    spendToDateCurrentBurst: partial.spend,
    spendYesterday: 0,
    spend: partial.spend,
    impressions: 8_000,
    clicks: 0,
    results: 0,
    videoViews: 0,
    deliverableActual: 8_000,
    ctr: null,
    conversionRate: null,
    cpv: null,
    vtr: null,
    kpiTargets: null,
    platformCampaigns: [],
  }
}

function programmatic(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItemId: string
  platform: string
  platformLabel: string
  spend?: number
  impressions?: number
}): ProgrammaticPacingCampaignRow {
  return {
    mbaNumber: partial.mbaNumber,
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId: partial.lineItemId,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: partial.clientName,
    campaignName: partial.campaignName,
    campaignStatus: "booked",
    campaignStartDate: START,
    campaignEndDate: END,
    brand: null,
    platform: partial.platform,
    platformLabel: partial.platformLabel,
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    channelFamily: "progVideo",
    snowflakeChannel: "programmatic-video",
    deliverableMetric: "IMPRESSIONS",
    deliverableTarget: 0,
    lineItemStartDate: START,
    lineItemEndDate: END,
    totalLineItemBudget: 5_000,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    currentBurst: null,
    lineItemStatus: "no-data",
    burstDays: null,
    burstDaysRemaining: null,
    spendPerDayRemaining: null,
    spendRemainingCurrentBurst: null,
    spendRemainingLineTotal: null,
    spendToDateLineTotal: partial.spend ?? 0,
    spendToDateCurrentBurst: 0,
    spendYesterday: 0,
    spend: partial.spend ?? 0,
    impressions: partial.impressions ?? 0,
    clicks: 0,
    results: 0,
    videoViews: 0,
    deliverableActual: 0,
    ctr: null,
    conversionRate: null,
    cpm: null,
    cpv: null,
    vtr: null,
    kpiTargets: null,
    platformCampaigns: [],
  }
}

function bvod(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  delivered: number
  planned: number
}): AdServingPacingCampaignRow {
  return {
    mbaNumber: partial.mbaNumber,
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId: `${partial.mbaNumber}BV1`,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: partial.clientName,
    campaignName: partial.campaignName,
    campaignStatus: "booked",
    campaignStartDate: START,
    campaignEndDate: END,
    brand: null,
    platform: "",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    channelFamily: "bvod",
    lineItemStartDate: START,
    lineItemEndDate: END,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    currentBurst: null,
    lineItemStatus: "serving",
    plannedImpressions: partial.planned,
    plannedClicks: 0,
    impressions: partial.delivered,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 10,
    deliverableProgress: partial.planned > 0 ? partial.delivered / partial.planned : null,
    deliverableActual: partial.delivered,
    deliverableTarget: partial.planned,
    deliverableKind: "impressions",
  }
}

function fixtureRows() {
  const schedulesByMba = new Map<string, CampaignScheduleInput>([
    schedule("letsgo001", 40_000, 100_000),
    schedule("jayco001", 20_000, 50_000),
    schedule("candel001", 5_000, 5_000),
    schedule("BICAU002", 40_000, 100_000),
    schedule("hartm012", 2_000, 10_000),
    schedule("PGAAUS014", 8_000, 20_000),
  ])

  return assembleCampaignPacingRows({
    asOfDate: AS_OF,
    allowedClientSlugs: null,
    liveOnly: true,
    search: [
      search({
        mbaNumber: "letsgo001",
        clientName: "Lets Go",
        campaignName: "Lets Go Over",
        lineItemId: "letsgo001SE1",
        spend: 50_000,
        budget: 100_000,
      }),
      search({
        mbaNumber: "jayco001",
        clientName: "Jayco",
        campaignName: "Jayco Mixed",
        lineItemId: "jayco001SE1",
        spend: 10_000,
        budget: 20_000,
      }),
      search({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItemId: "BICAU002SE1",
        spend: 38_500,
        budget: 40_000,
        kpi: true,
      }),
      search({
        mbaNumber: "hartm012",
        clientName: "Hartmann",
        campaignName: "Hartmann Silence",
        lineItemId: "hartm012SE1",
        spend: 0,
        budget: 10_000,
        impressions: 0,
      }),
      search({
        mbaNumber: "PGAAUS014",
        clientName: "PGA Australia",
        campaignName: "PGA On Track",
        lineItemId: "PGAAUS014SE1",
        spend: 7_800,
        budget: 8_000,
      }),
    ],
    social: [
      social({
        mbaNumber: "jayco001",
        clientName: "Jayco",
        campaignName: "Jayco Mixed",
        lineItemId: "jayco001SO1",
        spend: 4_000,
        budget: 5_000,
      }),
    ],
    programmatic: [
      programmatic({
        mbaNumber: "candel001",
        clientName: "Candel",
        campaignName: "Candel Unmapped",
        lineItemId: "candel001PV1",
        platform: "mystery dsp",
        platformLabel: "Mystery Dsp",
      }),
    ],
    adServing: [
      bvod({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        delivered: 5_000,
        planned: 20_000,
      }),
    ],
    direct: [],
    schedulesByMba,
  })
}

describe("assembleCampaignPacingRows fixtures", () => {
  const rows = fixtureRows()
  const byMba = Object.fromEntries(rows.map((row) => [row.mbaNumber, row]))

  it("returns one row per campaign in attention-then-healthy order", () => {
    assert.deepEqual(
      rows.map((row) => row.mbaNumber),
      ["letsgo001", "jayco001", "candel001", "hartm012", "BICAU002", "PGAAUS014"],
    )
  })

  it("letsgo001 is ahead / over-pacing with a daily-rate why", () => {
    const row = byMba.letsgo001
    assert.equal(row.pace, "ahead")
    assert.ok(row.spendPct > 110)
    assert.ok(row.projectedFinish != null && row.projectedFinish > row.budget * 1.15)
    assert.match(
      row.why,
      /Search is spending at 1\.3× the daily plan; projected finish \$117,949 against \$100,000\./,
    )
  })

  it("jayco001 is behind with mixed channel copy", () => {
    const row = byMba.jayco001
    assert.equal(row.pace, "behind")
    const searchCh = row.channels.find((ch) => ch.channelKey === "search")
    const socialCh = row.channels.find((ch) => ch.channelKey === "social-meta")
    assert.equal(searchCh?.pace, "behind")
    assert.equal(socialCh?.pace, "on_track")
    assert.match(row.why, /Search is 63% of expected; Social · Meta on track\./)
  })

  it("candel001 is no_source", () => {
    const row = byMba.candel001
    assert.equal(row.pace, "no_source")
    assert.equal(row.channels[0]?.sourceState, "no_source")
    assert.equal(
      row.why,
      "Prog video · Mystery Dsp has no source connected, so the campaign cannot read on track.",
    )
  })

  it("BICAU002 is on track with BVOD behind", () => {
    const row = byMba.BICAU002
    assert.equal(row.pace, "on_track")
    const bvodCh = row.channels.find((ch) => ch.channelKey === "bvod")
    assert.equal(bvodCh?.pace, "behind")
    assert.equal(bvodCh?.spendMode, "actual")
    assert.equal(bvodCh?.spendToDate, 0)
    assert.deepEqual(row.kpi, { tracked: 1, total: 1 })
    assert.match(row.why, /Delivery is 96% of expected with 106 days left\./)
  })

  it("hartm012 is no_delivery after 2+ days with zero rows", () => {
    const row = byMba.hartm012
    assert.equal(row.pace, "no_delivery")
    assert.ok(row.daysElapsed >= 2)
    assert.equal(row.spendToDate, 0)
    assert.equal(row.why, `${row.daysElapsed} days in flight and no rows from Search.`)
  })

  it("PGAAUS014 is on track", () => {
    const row = byMba.PGAAUS014
    assert.equal(row.pace, "on_track")
    assert.match(row.why, /Delivery is 98% of expected with 106 days left\./)
  })

  it("counts live / behind / on_track / ahead / over_pacing / attention", () => {
    assert.deepEqual(countPortfolioRows(rows), {
      live: 6,
      behind: 1,
      on_track: 2,
      ahead: 1,
      over_pacing: 1,
      attention: 4,
    })
  })
})
