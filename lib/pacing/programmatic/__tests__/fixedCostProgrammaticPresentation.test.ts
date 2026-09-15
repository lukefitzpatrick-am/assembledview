import assert from "node:assert/strict"
import test from "node:test"

import {
  applyFixedCostProgrammaticDeliveryPresentation,
} from "../fixedCostProgrammaticPresentation"
import type { ProgrammaticPacingCampaignRow } from "../types"

function row(overrides: Partial<ProgrammaticPacingCampaignRow> = {}): ProgrammaticPacingCampaignRow {
  return {
    mbaNumber: "bicau002",
    mediaPlanVersionId: 1,
    mediaPlanVersionNumber: 1,
    lineItemId: "bicau002pv1",
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: "BIC",
    campaignName: "Always on",
    campaignStatus: "approved",
    campaignStartDate: "2026-03-01",
    campaignEndDate: "2026-03-31",
    brand: null,
    platform: "Channel Factory",
    platformLabel: "Channel Factory",
    bidStrategy: "",
    buyType: "cpv",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: true,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    channelFamily: "progVideo",
    snowflakeChannel: "programmatic-video",
    deliverableMetric: "VIDEO_3S_VIEWS",
    deliverableTarget: 1000,
    lineItemStartDate: "2026-03-01",
    lineItemEndDate: "2026-03-31",
    totalLineItemBudget: 1000,
    totalBursts: 1,
    bursts: [],
    currentBurstIndex: 0,
    currentBurst: {
      index: 0,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      budget: 1000,
      buyAmount: 1000,
      calculatedValue: 1000,
    },
    lineItemStatus: "behind",
    burstDays: 31,
    burstDaysRemaining: 10,
    spendPerDayRemaining: 100,
    spendRemainingCurrentBurst: 1000,
    spendRemainingLineTotal: 1000,
    spendToDateLineTotal: 0,
    spendToDateCurrentBurst: 0,
    spendYesterday: 0,
    spend: 0,
    impressions: 12_000,
    clicks: 10,
    results: 0,
    videoViews: 4_000,
    deliverableActual: 4_000,
    ctr: 0.001,
    conversionRate: null,
    cpm: 0,
    cpv: 0,
    vtr: 0.33,
    kpiTargets: null,
    platformCampaigns: [],
    ...overrides,
  }
}

test("fixed-cost programmatic rows drop spend rates and Behind, keep delivery", () => {
  const fixed = row()
  applyFixedCostProgrammaticDeliveryPresentation(fixed)
  assert.equal(fixed.cpm, null)
  assert.equal(fixed.cpv, null)
  assert.equal(fixed.lineItemStatus, "on-track")
  assert.equal(fixed.impressions, 12_000)
  assert.equal(fixed.videoViews, 4_000)
  assert.equal(fixed.vtr, 0.33)
  assert.equal(fixed.spendPacingDeferredToDirect, true)
})

test("a DV360 row is unchanged", () => {
  const dv = row({
    fixedCostMedia: false,
    platform: "dv360",
    lineItemStatus: "behind",
    cpm: 12,
    cpv: 0.4,
    spend: 80,
  })
  applyFixedCostProgrammaticDeliveryPresentation(dv)
  assert.equal(dv.cpm, 12)
  assert.equal(dv.cpv, 0.4)
  assert.equal(dv.lineItemStatus, "behind")
  assert.equal(dv.spendPacingDeferredToDirect, false)
})
