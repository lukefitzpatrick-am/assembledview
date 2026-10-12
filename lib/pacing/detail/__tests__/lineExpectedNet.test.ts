import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeToDateFromBursts } from "@/lib/delivery/search/searchCore"
import { netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { searchFixture, socialFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import {
  lineTimePct,
  projectLineFinish,
  spendVsExpectedPct,
} from "@/lib/pacing/channel/lineCardPace"
import { lineCardFromSearch, lineCardFromSocial } from "@/lib/pacing/channel/lineCardModel"
import { statusFromExpectedPct } from "@/lib/pacing/status"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import type { CampaignPacingRow, CampaignScheduleInput } from "@/lib/pacing/portfolio/types"
import { assembleCampaignDetailPayload } from "../assembleCampaignDetailPayload"
import { lineExpectedNetToDate, netBurstMediaForPacing } from "../netBurstMediaForPacing"

const FEE_PCT = 15
const GROSS = 11_500
const SPENT = 4_887.5
const START = "2026-07-01"
const END = "2026-07-10"
const DAY_5 = "2026-07-05"

function oneBurst(budget: number) {
  return {
    index: 0,
    startDate: START,
    endDate: END,
    budget,
    buyAmount: 0,
    calculatedValue: 0,
  }
}

describe("line expected net media", () => {
  it("rates a fee-inclusive line on track at half of net media", () => {
    const burst = oneBurst(GROSS)
    const row = searchFixture({
      lineItemStartDate: START,
      lineItemEndDate: END,
      totalLineItemBudget: GROSS,
      totalBursts: 1,
      bursts: [burst],
      currentBurst: burst,
      currentBurstIndex: 0,
      budgetIncludesFees: true,
      spendToDateLineTotal: SPENT,
    })
    const expected = lineExpectedNetToDate({
      bursts: row.bursts,
      budgetIncludesFees: true,
      feePct: FEE_PCT,
      lineBudget: GROSS,
      lineStart: START,
      lineEnd: END,
      asOf: DAY_5,
      lineItemId: row.lineItemId,
    })
    assert.ok(Math.abs(expected - SPENT) < 0.01)
    assert.equal(netBurstMediaForPacing(burst, { budgetIncludesFees: true }, FEE_PCT), netFromGross(GROSS, true, FEE_PCT))

    const card = lineCardFromSearch(row, DAY_5, FEE_PCT)
    assert.equal(card.pace, "on_track")
    assert.ok(Math.abs(card.linePct - 100) < 0.01)

    const payload = assembleCampaignDetailPayload({
      row: { expectedToDate: expected, channels: [] } as unknown as CampaignPacingRow,
      lines: [card],
      asOf: DAY_5,
    })
    const line = payload.lines[0]
    assert.equal(line?.pace, card.pace)
    assert.equal(line?.linePct, card.linePct)
  })

  it("leaves a non-fee line on the burst budget", () => {
    const burst = oneBurst(GROSS)
    const row = searchFixture({
      lineItemStartDate: START,
      lineItemEndDate: END,
      totalLineItemBudget: GROSS,
      totalBursts: 1,
      bursts: [burst],
      currentBurst: burst,
      currentBurstIndex: 0,
      budgetIncludesFees: false,
      spendToDateLineTotal: GROSS / 2,
    })
    const expected = lineExpectedNetToDate({
      bursts: row.bursts,
      budgetIncludesFees: false,
      feePct: FEE_PCT,
      lineBudget: GROSS,
      lineStart: START,
      lineEnd: END,
      asOf: DAY_5,
      lineItemId: row.lineItemId,
    })
    const burstProration = computeToDateFromBursts(
      [{ startISO: START, endISO: END, budget: GROSS, clicksGoal: 0 }],
      DAY_5,
      "budget",
    ).expectedToDate
    assert.equal(expected, burstProration)
    assert.equal(expected, GROSS / 2)
    const card = lineCardFromSearch(row, DAY_5, FEE_PCT)
    assert.equal(card.pace, "on_track")
  })

  it("stays on track after week 1's net budget is spent", () => {
    const week1 = {
      index: 0,
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      budget: 8_000,
      buyAmount: 0,
      calculatedValue: 0,
    }
    const later = {
      index: 1,
      startDate: "2026-07-08",
      endDate: "2026-08-04",
      budget: 2_000,
      buyAmount: 0,
      calculatedValue: 0,
    }
    const asOf = "2026-07-07"
    const lineStart = week1.startDate
    const lineEnd = later.endDate
    const row = searchFixture({
      lineItemStartDate: lineStart,
      lineItemEndDate: lineEnd,
      totalLineItemBudget: 10_000,
      totalBursts: 2,
      bursts: [week1, later],
      currentBurst: week1,
      currentBurstIndex: 0,
      budgetIncludesFees: false,
      spendToDateLineTotal: 8_000,
    })
    const card = lineCardFromSearch(row, asOf, 0)
    assert.equal(card.pace, "on_track")

    const timePct = lineTimePct(lineStart, lineEnd, asOf)
    const straight = spendVsExpectedPct(8_000, 10_000, timePct)
    assert.equal(statusFromExpectedPct(straight), "over-pacing")
    const projected = projectLineFinish(8_000, timePct)
    assert.ok(projected != null && projected > 10_000)
  })

  it("sums platform-channel line expected within $1 of campaign expected", () => {
    const mba = "netrec001"
    const asOf = "2026-09-16"
    const searchNet = netFromGross(GROSS, true, FEE_PCT)
    const socialNet = 5_000
    const searchBurst = {
      index: 0,
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      budget: GROSS,
      buyAmount: 0,
      calculatedValue: 0,
    }
    const socialBurst = {
      index: 0,
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      budget: socialNet,
      buyAmount: 0,
      calculatedValue: 0,
    }
    const search = searchFixture({
      mbaNumber: mba,
      campaignName: "Net recon",
      campaignStartDate: "2026-07-01",
      campaignEndDate: "2026-12-31",
      lineItemStartDate: "2026-07-01",
      lineItemEndDate: "2026-07-31",
      totalLineItemBudget: GROSS,
      totalBursts: 1,
      bursts: [searchBurst],
      currentBurst: searchBurst,
      currentBurstIndex: 0,
      budgetIncludesFees: true,
      spendToDateLineTotal: searchNet,
    })
    const social = socialFixture({
      mbaNumber: mba,
      campaignName: "Net recon",
      campaignStartDate: "2026-07-01",
      campaignEndDate: "2026-12-31",
      lineItemStartDate: "2026-07-01",
      lineItemEndDate: "2026-07-31",
      totalLineItemBudget: socialNet,
      totalBursts: 1,
      bursts: [socialBurst],
      currentBurst: socialBurst,
      currentBurstIndex: 0,
      budgetIncludesFees: false,
      spendToDateLineTotal: socialNet,
    })
    const searchExpected = lineExpectedNetToDate({
      bursts: search.bursts,
      budgetIncludesFees: true,
      feePct: FEE_PCT,
      lineBudget: GROSS,
      lineStart: search.lineItemStartDate,
      lineEnd: search.lineItemEndDate,
      asOf,
      lineItemId: search.lineItemId,
    })
    const socialExpected = lineExpectedNetToDate({
      bursts: social.bursts,
      budgetIncludesFees: false,
      feePct: 0,
      lineBudget: socialNet,
      lineStart: social.lineItemStartDate,
      lineEnd: social.lineItemEndDate,
      asOf,
      lineItemId: social.lineItemId,
    })
    const schedule: CampaignScheduleInput = {
      deliverySchedule: [
        {
          month: "July 2026",
          mediaCosts: { search: searchNet, social: socialNet },
          feeTotal: "$0.00",
        },
      ],
      campaignBudget: searchNet + socialNet,
    }
    const rows = assembleCampaignPacingRows({
      asOfDate: asOf,
      allowedClientSlugs: null,
      search: [search],
      social: [social],
      programmatic: [],
      adServing: [],
      direct: [],
      schedulesByMba: new Map([[mba, schedule]]),
    })
    const campaign = rows.find((row) => row.mbaNumber === mba)
    assert.ok(campaign, "campaign row missing")
    const lineSum = searchExpected + socialExpected
    const gap = Math.abs(lineSum - campaign.expectedToDate)
    assert.ok(
      gap <= 1,
      `line sum ${lineSum} vs campaign expected ${campaign.expectedToDate} (gap ${gap})`,
    )

    const searchCard = lineCardFromSearch(search, asOf, FEE_PCT)
    const socialCard = lineCardFromSocial(social, asOf, 0)
    assert.equal(searchCard.pace, "on_track")
    assert.equal(socialCard.pace, "on_track")
  })

  it("logs a straight line of net budget when the line has no bursts", () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "))
    }
    try {
      const expected = lineExpectedNetToDate({
        bursts: [],
        budgetIncludesFees: true,
        feePct: FEE_PCT,
        lineBudget: GROSS,
        lineStart: START,
        lineEnd: END,
        asOf: DAY_5,
        lineItemId: "noburst1",
      })
      assert.ok(Math.abs(expected - SPENT) < 0.01)
      assert.equal(
        warnings.filter((line) =>
          line.includes("[pacing-detail] no bursts for noburst1; straight-line net budget"),
        ).length,
        1,
      )
    } finally {
      console.warn = original
    }
  })
})
