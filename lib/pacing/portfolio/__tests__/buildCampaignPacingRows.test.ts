import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { DirectCampaignGroup, DirectLineItemRow } from "../../direct/types.js"
import { assembleCampaignPacingRows, countPortfolioRows } from "../assembleCampaignPacingRows.js"
import {
  BICAU002_BVOD_REPORTED,
  BICAU002_CF_REPORTED,
  BICAU002_META_ACTUAL,
  BICAU002_SPEND_TO_DATE,
  BICAU002_UMG_REPORTED,
  P6_AS_OF,
  p6FixtureRows,
} from "./p6Fixture.js"

describe("assembleCampaignPacingRows fixtures", () => {
  const rows = p6FixtureRows()
  const byMba = Object.fromEntries(rows.map((row) => [row.mbaNumber, row]))

  it("returns one row per campaign in attention-then-healthy order", () => {
    assert.deepEqual(
      rows.map((row) => row.mbaNumber),
      ["letsgo001", "jayco001", "candel001", "hartm012", "PGAAUS014", "BICAU002"],
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

  it("BICAU002 attributes reported spend onto the owning channels", () => {
    const row = byMba.BICAU002
    assert.equal(row.pace, "on_track")
    assert.equal(Number(row.spendToDate.toFixed(2)), BICAU002_SPEND_TO_DATE)
    const cf = row.channels.find((ch) => ch.label.includes("Channel Factory"))
    const bvodCh = row.channels.find((ch) => ch.channelKey === "bvod")
    const umg = row.channels.find((ch) => ch.channelKey === "digital-video")
    const meta = row.channels.find((ch) => ch.channelKey === "social-meta")
    assert.equal(cf?.spendToDate, BICAU002_CF_REPORTED)
    assert.equal(cf?.spendMode, "reported")
    assert.equal(bvodCh?.spendToDate, BICAU002_BVOD_REPORTED)
    assert.equal(bvodCh?.spendMode, "reported")
    assert.equal(umg?.spendToDate, BICAU002_UMG_REPORTED)
    assert.equal(umg?.spendMode, "reported")
    assert.equal(meta?.spendToDate, BICAU002_META_ACTUAL)
    assert.equal(meta?.spendMode, "actual")
    assert.equal(
      row.channels.some((ch) => ch.channelKey === "direct" || ch.channelKey.startsWith("direct-")),
      false,
    )
    assert.match(row.why, /Delivery is 100% of expected with 106 days left\./)
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

  it("unmatched Direct lines stay on a Direct row labelled by media type", () => {
    const line: DirectLineItemRow = {
      lineItemId: "PENFOLD016TV1",
      mbaNumber: "PENFOLD016",
      lineItemName: "Seven",
      buyType: "fixed_cost",
      isCurrentlyFixedCost: true,
      wasEverFixedCost: true,
      totalBudget: 8_000,
      totalReported: 2_500,
      totalActual: 0,
      variance: 2_500,
      variancePct: 1,
      burstCount: 1,
      burstsDeliveredOver: 0,
      burstsDeliveredUnder: 0,
      lineItemStatus: "in_progress",
      bursts: [],
      daily: [],
    }
    const group: DirectCampaignGroup = {
      mbaNumber: "PENFOLD016",
      clientName: "Penfolds",
      campaignName: "TV only",
      campaignStatus: "booked",
      campaignStartDate: "2026-07-01",
      campaignEndDate: "2026-12-31",
      brand: null,
      lineItems: [line],
      totalBudget: 8_000,
      totalReported: 2_500,
      totalActual: 0,
      variance: 2_500,
    }
    const [row] = assembleCampaignPacingRows({
      asOfDate: P6_AS_OF,
      allowedClientSlugs: null,
      liveOnly: true,
      search: [],
      social: [],
      programmatic: [],
      adServing: [],
      direct: [group],
      schedulesByMba: new Map(),
    })
    assert.ok(row)
    assert.equal(row.channels.length, 1)
    assert.equal(row.channels[0]?.label, "Direct · Television")
    assert.equal(row.channels[0]?.spendToDate, 2_500)
    assert.equal(row.channels[0]?.spendMode, "reported")
    assert.equal(row.spendToDate, 2_500)
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
