import type { SearchPacingCampaignRow } from "../../campaigns/types.js"
import type { SocialPacingCampaignRow } from "../../social/types.js"
import type { ProgrammaticPacingCampaignRow } from "../../programmatic/types.js"
import type { AdServingPacingCampaignRow } from "../../ad-serving/types.js"
import type {
  DirectCampaignGroup,
  DirectLineItemRow,
} from "../../direct/types.js"
import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import type { CampaignScheduleInput } from "../types.js"

export const BICAU002_CF_REPORTED = 20_376
export const BICAU002_BVOD_REPORTED = 9_853
export const BICAU002_UMG_REPORTED = 9_120
export const BICAU002_META_ACTUAL = 11_894.36
export const BICAU002_SPEND_TO_DATE =
  BICAU002_CF_REPORTED + BICAU002_BVOD_REPORTED + BICAU002_UMG_REPORTED + BICAU002_META_ACTUAL

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
  fixedCostMedia?: boolean
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
    fixedCostMedia: partial.fixedCostMedia === true,
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

function adServing(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItemId: string
  channelFamily: AdServingPacingCampaignRow["channelFamily"]
  delivered: number
  planned: number
}): AdServingPacingCampaignRow {
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
    platform: "",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    channelFamily: partial.channelFamily,
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

function directLine(partial: {
  mbaNumber: string
  lineItemId: string
  reported: number
  budget: number
  name?: string
}): DirectLineItemRow {
  return {
    lineItemId: partial.lineItemId,
    mbaNumber: partial.mbaNumber,
    lineItemName: partial.name ?? partial.lineItemId,
    buyType: "fixed_cost",
    isCurrentlyFixedCost: true,
    wasEverFixedCost: true,
    totalBudget: partial.budget,
    totalReported: partial.reported,
    totalActual: 0,
    variance: partial.reported,
    variancePct: partial.reported > 0 ? 1 : null,
    burstCount: 1,
    burstsDeliveredOver: 0,
    burstsDeliveredUnder: 0,
    lineItemStatus: "in_progress",
    bursts: [],
    daily: [],
  }
}

function directGroup(partial: {
  mbaNumber: string
  clientName: string
  campaignName: string
  lineItems: DirectLineItemRow[]
}): DirectCampaignGroup {
  return {
    mbaNumber: partial.mbaNumber,
    clientName: partial.clientName,
    campaignName: partial.campaignName,
    campaignStatus: "booked",
    campaignStartDate: START,
    campaignEndDate: END,
    brand: null,
    lineItems: partial.lineItems,
    totalBudget: partial.lineItems.reduce((sum, li) => sum + li.totalBudget, 0),
    totalReported: partial.lineItems.reduce((sum, li) => sum + li.totalReported, 0),
    totalActual: 0,
    variance: partial.lineItems.reduce((sum, li) => sum + li.variance, 0),
  }
}

export function p6FixtureRows() {
  const schedulesByMba = new Map<string, CampaignScheduleInput>([
    schedule("letsgo001", 40_000, 100_000),
    schedule("jayco001", 20_000, 50_000),
    schedule("candel001", 5_000, 5_000),
    schedule("BICAU002", BICAU002_SPEND_TO_DATE, 100_000),
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
      social({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItemId: "BICAU002SM1",
        spend: BICAU002_META_ACTUAL,
        budget: BICAU002_META_ACTUAL,
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
      programmatic({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItemId: "BICAU002PV1",
        platform: "channel factory",
        platformLabel: "Channel Factory",
        impressions: 12_000,
        fixedCostMedia: true,
      }),
    ],
    adServing: [
      adServing({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItemId: "BICAU002BV1",
        channelFamily: "bvod",
        delivered: 5_000,
        planned: 20_000,
      }),
      adServing({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItemId: "BICAU002DV1",
        channelFamily: "digitalVideo",
        delivered: 8_000,
        planned: 10_000,
      }),
    ],
    direct: [
      directGroup({
        mbaNumber: "BICAU002",
        clientName: "Penfolds",
        campaignName: "Penfolds Always On",
        lineItems: [
          directLine({
            mbaNumber: "BICAU002",
            lineItemId: "bicau002pv1",
            reported: BICAU002_CF_REPORTED,
            budget: BICAU002_CF_REPORTED,
            name: "Channel Factory",
          }),
          directLine({
            mbaNumber: "BICAU002",
            lineItemId: "BICAU002BV1",
            reported: BICAU002_BVOD_REPORTED,
            budget: 19_500,
            name: "BVOD",
          }),
          directLine({
            mbaNumber: "BICAU002",
            lineItemId: "BICAU002DV1",
            reported: BICAU002_UMG_REPORTED,
            budget: BICAU002_UMG_REPORTED,
            name: "UMG",
          }),
        ],
      }),
    ],
    schedulesByMba,
  })
}
