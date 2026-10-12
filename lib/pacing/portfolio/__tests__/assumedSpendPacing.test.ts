import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  adServingFixture,
  directGroupFixture,
  directLineFixture,
  programmaticFixture,
  socialFixture,
} from "@/lib/pacing/channel/__tests__/fixtures"
import type { DirectDailyPoint, DirectLineItemRow } from "@/lib/pacing/direct/types"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { channelSpendCaption } from "@/lib/pacing/portfolio/channelSpendCaption"
import type { ChannelPacingRow } from "@/lib/pacing/portfolio/types"

const AS_OF = "2026-10-12"
const EXPECTED = 2_000

function assumedDay(reportedSpend: number): DirectDailyPoint {
  return {
    dateDay: "2026-10-01",
    burstIndex: 0,
    reportedSpend,
    actualPlatformSpend: 0,
    actualDeliverables: 0,
    expectedDailyDeliverables: 0,
    reportedCumulative: reportedSpend,
    actualCumulative: 0,
    expectedCumulative: 0,
    isSquareupDay: false,
    isLocked: true,
    buyType: "spots",
    capApplied: "assumed_spend",
  }
}

function radioLine(id: string, reported: number, budget: number): DirectLineItemRow {
  return directLineFixture({
    lineItemId: id,
    mbaNumber: "golf025",
    lineItemName: "Radio",
    buyType: "spots",
    isCurrentlyFixedCost: false,
    totalBudget: budget,
    totalReported: reported,
    totalActual: 0,
    variance: reported,
    daily: [assumedDay(reported)],
  })
}

function assemble(args: {
  social?: ReturnType<typeof socialFixture>[]
  programmatic?: ReturnType<typeof programmaticFixture>[]
  adServing?: ReturnType<typeof adServingFixture>[]
  lines: DirectLineItemRow[]
  expected?: number
}) {
  const group = directGroupFixture({
    mbaNumber: "golf025",
    clientName: "Golf",
    campaignName: "Australian Open",
    campaignStatus: "booked",
    campaignStartDate: "2026-07-01",
    campaignEndDate: "2026-12-31",
    lineItems: args.lines,
    totalBudget: args.lines.reduce((sum, line) => sum + line.totalBudget, 0),
    totalReported: args.lines.reduce((sum, line) => sum + line.totalReported, 0),
    totalActual: 0,
    variance: 0,
  })
  const [row] = assembleCampaignPacingRows({
    asOfDate: AS_OF,
    allowedClientSlugs: null,
    liveOnly: true,
    search: [],
    social: args.social ?? [],
    programmatic: args.programmatic ?? [],
    adServing: args.adServing ?? [],
    direct: args.lines.length > 0 ? [group] : [],
    schedulesByMba: new Map([
      ["golf025", { metricsExpectedSpendToDate: args.expected ?? EXPECTED }],
    ]),
  })
  assert.ok(row)
  return row
}

describe("assumed spend pacing rows", () => {
  it("adds radio assumed spend beside social actual without double counting", () => {
    const row = assemble({
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 500,
          totalLineItemBudget: 1_000,
          impressions: 10_000,
        }),
      ],
      lines: [radioLine("golf025RA1", 400, 800), radioLine("golf025RA2", 100, 200)],
    })
    const social = row.channels.find((channel) => channel.channelKey.startsWith("social-"))
    const radio = row.channels.find((channel) => channel.spendMode === "assumed")
    assert.equal(social?.spendToDate, 500)
    assert.equal(radio?.label, "Radio")
    assert.equal(radio?.spendToDate, 500)
    assert.deepEqual(radio?.lineItemIds, ["golf025RA1", "golf025RA2"])
    assert.equal(row.spendToDate, 1_000)
    assert.equal(row.expectedToDate, EXPECTED)
    assert.notEqual(row.pace, "no_source")
  })

  it("does not let an assumed channel force no_source, and still does when another channel has none", () => {
    const onlyAssumed = assemble({
      lines: [radioLine("golf025RA1", 500, 1_000)],
      expected: 1_000,
    })
    const radio = onlyAssumed.channels.find((channel) => channel.spendMode === "assumed")
    assert.equal(radio?.sourceState, "reporting")
    assert.notEqual(radio?.pace, "no_source")
    assert.notEqual(onlyAssumed.pace, "no_source")
    assert.equal(onlyAssumed.expectedToDate, 1_000)

    const withGap = assemble({
      lines: [radioLine("golf025RA1", 500, 1_000)],
      programmatic: [
        programmaticFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025PV9",
          platform: "Unmapped local site",
          platformLabel: "Unmapped local site",
          spendToDateLineTotal: 0,
          impressions: 0,
          deliverableActual: 0,
          totalLineItemBudget: 100,
        }),
      ],
      expected: 1_000,
    })
    const assumed = withGap.channels.find((channel) => channel.spendMode === "assumed")
    const unmapped = withGap.channels.find((channel) => channel.lineItemIds.includes("golf025PV9"))
    assert.equal(assumed?.sourceState, "reporting")
    assert.notEqual(assumed?.pace, "no_source")
    assert.equal(unmapped?.sourceState, "no_source")
    assert.equal(withGap.pace, "no_source")
  })

  it("drops assumed dollars once the line has a platform row", () => {
    const row = assemble({
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 800,
          totalLineItemBudget: 1_000,
          impressions: 10_000,
        }),
      ],
      lines: [radioLine("golf025SM1", 400, 800)],
    })
    assert.equal(row.channels.some((channel) => channel.spendMode === "assumed"), false)
    assert.equal(row.channels.find((channel) => channel.channelKey.startsWith("social-"))?.spendToDate, 800)
    assert.equal(row.spendToDate, 800)
  })

  it("keeps a CM360 line on the estimate and a fixed-cost programmatic line on reported", () => {
    const cm = assemble({
      adServing: [
        adServingFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025DD1",
          platform: "CM360",
        }),
      ],
      lines: [radioLine("golf025DD1", 1_234, 2_000)],
    })
    const display = cm.channels.find((channel) => channel.channelKey === "digital-display")
    assert.ok(display)
    assert.notEqual(display.spendMode, "assumed")
    assert.notEqual(display.spendMode, "reported")
    assert.notEqual(display.spendToDate, 1_234)
    assert.equal(cm.channels.some((channel) => channel.spendMode === "assumed"), false)

    const fixed = assemble({
      programmatic: [
        programmaticFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025PV1",
          platform: "dv360",
          platformLabel: "DV360",
          fixedCostMedia: true,
          spendToDateLineTotal: 0,
          impressions: 0,
          deliverableActual: 0,
        }),
      ],
      lines: [
        directLineFixture({
          lineItemId: "golf025PV1",
          mbaNumber: "golf025",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          totalReported: 2_500,
          totalBudget: 8_000,
          daily: [{ ...assumedDay(2_500), capApplied: "fixed_cost", buyType: "fixed_cost" }],
        }),
      ],
    })
    const prog = fixed.channels.find((channel) => channel.lineItemIds.includes("golf025PV1"))
    assert.equal(prog?.spendMode, "reported")
    assert.equal(prog?.spendToDate, 2_500)
    assert.equal(fixed.channels.some((channel) => channel.spendMode === "assumed"), false)
  })

  it("prints Assumed spend on the channel caption", () => {
    const channel = {
      channelKey: "assumed-ra",
      label: "Radio",
      spendToDate: 500,
      budget: 1_000,
      expectedToDate: 500,
      spendPct: 100,
      pace: "on_track",
      spendMode: "assumed",
      deliverable: null,
      sourceState: "reporting",
      lineItemIds: ["golf025RA1"],
    } satisfies ChannelPacingRow
    assert.equal(channelSpendCaption(channel), "Assumed spend $500 / $1,000")
  })
})
