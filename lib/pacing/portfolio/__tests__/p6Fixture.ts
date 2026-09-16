import type { SearchPacingCampaignRow } from "../../campaigns/types.js"
import type { SocialPacingCampaignRow } from "../../social/types.js"
import type { ProgrammaticPacingCampaignRow } from "../../programmatic/types.js"
import type { AdServingPacingCampaignRow } from "../../ad-serving/types.js"
import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import type { CampaignScheduleInput } from "../types.js"

export const P6_AS_OF = "2026-09-16"
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

export function p6FixtureRows() {
  const schedulesByMba = new Map<string, CampaignScheduleInput>([
    schedule("letsgo001", 40_000, 100_000),
    schedule("jayco001", 20_000, 50_000),
    schedule("candel001", 5_000, 5_000),
    schedule("BICAU002", 40_000, 100_000),
    schedule("hartm012", 2_000, 10_000),
    schedule("PGAAUS014", 8_000, 20_000),
  ])

  return assembleCampaignPacingRows({
    asOfDate: P6_AS_OF,
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
