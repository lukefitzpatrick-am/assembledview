/**
 * B32 fixtures: Ad Serving pacing rows as the composer returns them.
 * `cm360Rows` have no Channel Factory publisher (their consumer output is
 * pinned to 37bec7e1). `partnerRows` are the three live Channel Factory
 * Digital Video lines with their partner-file totals to 8 Nov 2026
 * (`VW_PACING_PARTNER_FILE`, read 10 Nov) and their published plan bursts.
 */
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"
import { findCurrentBurstIndex } from "@/lib/pacing/burst/currentBurst"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"

export const AS_OF = "2026-11-10"
export const COUNT_TO = "2026-11-09"

type Extra = Partial<AdServingPacingCampaignRow> & { rawBursts?: unknown }

function row(lineItemId: string, mba: string, extra: Extra): AdServingPacingCampaignRow {
  const { rawBursts, ...rest } = extra
  const bursts = parseBurstsToNormalised(rawBursts ?? [
    { startDate: "2026-10-01", endDate: "2026-12-31", budget: "$10,000.00", buyAmount: "$10.00", calculatedValue: 1000000 },
  ])
  const idx = findCurrentBurstIndex(bursts, AS_OF)
  const target = bursts.reduce((sum, b) => sum + (b.calculatedValue > 0 ? b.calculatedValue : 0), 0)
  const impressions = rest.impressions ?? 0
  return {
    mbaNumber: mba,
    mediaPlanVersionId: 100,
    mediaPlanVersionNumber: 2,
    lineItemId,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: "Acme",
    campaignName: `${mba} campaign`,
    campaignStatus: "approved",
    campaignStartDate: "2026-10-01",
    campaignEndDate: "2027-01-04",
    campaignEnded: false,
    brand: null,
    platform: "",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    channelFamily: "digitalVideo",
    lineItemStartDate: bursts[0]?.startDate ?? null,
    lineItemEndDate: bursts.at(-1)?.endDate ?? null,
    totalBursts: bursts.length,
    bursts,
    currentBurstIndex: idx,
    currentBurst: idx != null ? bursts[idx]! : null,
    lineItemStatus: "serving",
    plannedImpressions: target,
    plannedClicks: 0,
    impressions,
    clicks: 0,
    ctr: impressions > 0 ? (rest.clicks ?? 0) / impressions : null,
    videoCompletes: 0,
    results: 0,
    daysActive: impressions > 0 ? 10 : 0,
    deliverableProgress: target > 0 ? Math.min(1, impressions / target) : null,
    deliverableActual: impressions,
    deliverableTarget: target,
    deliverableKind: target > 0 ? "impressions" : null,
    budgetIncludesFees: false,
    ...rest,
  }
}

/** Rows without a Channel Factory publisher: every consumer output is pinned to 37bec7e1. */
export function cm360Rows(): AdServingPacingCampaignRow[] {
  return [
    row("golf025dv1", "GOLF025", { impressions: 120000, clicks: 40, videoCompletes: 30000, buyType: "cpm" }),
    row("golf025dv2", "GOLF025", { impressions: 0, clicks: 0, lineItemStatus: "serving" }),
    row("golf025dd1", "GOLF025", { channelFamily: "digitalDisplay", platform: "cm360", impressions: 50000, clicks: 25 }),
    row("seven001bv1", "SEVEN001", { channelFamily: "bvod", platform: "Seven", impressions: 80000, buyType: "cpm" }),
    row("quant001dd1", "QUANT001", { channelFamily: "digitalDisplay", platform: "Quantcast", impressions: 90000 }),
    row("umg001dv1", "UMG001", { platform: "Channel Factory", impressions: 40000, videoCompletes: 20000, buyType: "cpv" }),
    row("fixed001da1", "FIXED001", { channelFamily: "digitalAudio", buyType: "fixed_cost", impressions: 10000 }),
    row("click001dd1", "CLICK001", {
      channelFamily: "digitalDisplay",
      buyType: "cpc",
      clicks: 300,
      impressions: 60000,
      deliverableKind: "clicks",
      deliverableTarget: 2000,
      deliverableActual: 300,
      deliverableProgress: 0.15,
      plannedImpressions: 0,
      plannedClicks: 2000,
    }),
    row("ended001dv1", "ENDED001", { campaignEnded: true, campaignEndDate: "2026-11-05", impressions: 5000 }),
  ]
}

const PENFOLD020DV2_BURSTS =
  '[{"fee": 0, "budget": "$30,000.00", "endDate": "2026-12-23T13:00:00.000Z", "buyAmount": "$0.07", "startDate": "2026-10-19T13:00:00.000Z", "calculatedValue": 428571}]'
const TRWICO001DV1_BURSTS =
  '[{"fee": 0, "budget": "$40,000.00", "endDate": "2026-11-29T13:00:00.000Z", "buyAmount": "$0.08", "startDate": "2026-10-14T13:00:00.000Z", "calculatedValue": 500000}, {"fee": 0, "budget": "$40,000.00", "endDate": "2027-04-29T14:00:00.000Z", "buyAmount": "$0.08", "startDate": "2027-02-28T13:00:00.000Z", "calculatedValue": 500000}]'
const TRWICO001DV2_BURSTS =
  '[{"fee": 0, "budget": "$10,000.00", "endDate": "2026-11-29T13:00:00.000Z", "buyAmount": "$8.00", "startDate": "2026-10-14T13:00:00.000Z", "calculatedValue": 1250000}, {"fee": 0, "budget": "$10,000.00", "endDate": "2027-04-29T14:00:00.000Z", "buyAmount": "$8.00", "startDate": "2027-02-28T13:00:00.000Z", "calculatedValue": 1250000}]'

/** The three live Channel Factory Digital Video lines, partner-reported only. */
export function partnerRows(): AdServingPacingCampaignRow[] {
  return [
    row("penfold020dv2", "PENFOLD020", {
      mediaPlanVersionId: 16999,
      campaignName: "Troye Holiday FY27",
      campaignStartDate: "2026-10-01",
      campaignEndDate: "2027-01-04",
      buyType: "cpv",
      rawBursts: PENFOLD020DV2_BURSTS,
      impressions: 226616,
      clicks: 83,
      videoCompletes: 165856,
      daysActive: 20,
      publisher: "Channel Factory",
      deliverySource: "partner_file",
    }),
    row("trwico001dv1", "TRWICO001", {
      mediaPlanVersionId: 19650,
      campaignName: "TRWICO001 campaign",
      campaignStartDate: "2026-10-04",
      campaignEndDate: "2027-04-30",
      platform: "Channel Factory",
      buyType: "cpv",
      rawBursts: TRWICO001DV1_BURSTS,
      impressions: 376831,
      clicks: 120,
      videoCompletes: 288345,
      daysActive: 19,
      publisher: "Channel Factory",
      deliverySource: "partner_file",
    }),
    row("trwico001dv2", "TRWICO001", {
      mediaPlanVersionId: 19650,
      campaignName: "TRWICO001 campaign",
      campaignStartDate: "2026-10-04",
      campaignEndDate: "2027-04-30",
      platform: "Channel Factory",
      buyType: "cpm",
      rawBursts: TRWICO001DV2_BURSTS,
      impressions: 631051,
      clicks: 326,
      videoCompletes: 3238,
      daysActive: 19,
      publisher: "Channel Factory",
      deliverySource: "partner_file",
    }),
  ]
}
