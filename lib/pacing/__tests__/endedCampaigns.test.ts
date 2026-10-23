/** Ended campaigns stay on the admin pacing lists for a week (Luke, 23 Oct 2026). */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { lineCardFromSearch } from "@/lib/pacing/channel/lineCardModel"
import {
  ENDED_CAMPAIGN_LISTED_DAYS,
  campaignEndedBefore,
  endedLineStatus,
  isListedOnAdminPacing,
  isRecentlyEndedCampaign,
} from "../endedCampaigns.js"
import { filterLiveMasters } from "../plans/resolveLivePlanLineItems.js"
import { mapSpendRowToOverviewItem } from "../overview/mapOverviewItems.js"
import { assembleCampaignPacingRows } from "../portfolio/assembleCampaignPacingRows.js"
import { buildDigestCampaignRows, digestRowsFromPortfolioCampaigns } from "../../ops/digest/banding.js"
import type { MediaPlanMaster } from "@/lib/types/mediaPlanMaster"

const VIEW = "2026-10-23"
const COUNT_TO = "2026-10-22"

function master(mba: string, status: string, start: string, end: string): MediaPlanMaster {
  return {
    id: 1,
    mba_number: mba,
    mp_client_name: "Krusty Krab",
    mp_campaignname: mba,
    version_number: 1,
    campaign_status: status,
    campaign_start_date: start,
    campaign_end_date: end,
    mp_campaignbudget: 0,
  }
}

describe("listing rule", () => {
  it("the constant is 7 days", () => {
    assert.equal(ENDED_CAMPAIGN_LISTED_DAYS, 7)
  })

  it("lists live and ended-within-a-week approved or booked campaigns", () => {
    // Ended 16 Oct: 23 Oct is the 7th day after, still listed.
    assert.equal(isListedOnAdminPacing("booked", "2026-09-01", "2026-10-16", VIEW), true)
    assert.equal(isRecentlyEndedCampaign("approved", "2026-09-01", "2026-10-22", VIEW), true)
    // Ended 15 Oct: 8 days ago, dropped.
    assert.equal(isListedOnAdminPacing("booked", "2026-09-01", "2026-10-15", VIEW), false)
    // Live today.
    assert.equal(isListedOnAdminPacing("booked", "2026-10-01", "2026-10-31", VIEW), true)
    assert.equal(isRecentlyEndedCampaign("booked", "2026-10-01", "2026-10-31", VIEW), false)
    // Cancelled, planned and draft stay off.
    assert.equal(isListedOnAdminPacing("cancelled", "2026-09-01", "2026-10-20", VIEW), false)
    assert.equal(isListedOnAdminPacing("planned", "2026-09-01", "2026-10-20", VIEW), false)
    assert.equal(isListedOnAdminPacing("draft", "2026-09-01", "2026-10-20", VIEW), false)
  })

  it("lists stored completed campaigns on the same 7-day rule", () => {
    assert.equal(isRecentlyEndedCampaign("completed", "2026-09-01", "2026-10-20", VIEW), true)
    assert.equal(isListedOnAdminPacing("Completed", "2026-09-01", "2026-10-16", VIEW), true)
    // 8 days after the end date: dropped.
    assert.equal(isListedOnAdminPacing("completed", "2026-09-01", "2026-10-15", VIEW), false)
    // Stored completed but the end date is not before the view day: not listed.
    assert.equal(isListedOnAdminPacing("completed", "2026-10-01", "2026-10-31", VIEW), false)
    assert.equal(isListedOnAdminPacing("completed", "2026-10-01", "2026-10-23", VIEW), false)
    // No end date: not listed.
    assert.equal(isListedOnAdminPacing("completed", null, null, VIEW), false)
  })

  it("ended means the end date is before the view day", () => {
    assert.equal(campaignEndedBefore("2026-10-22", VIEW), true)
    assert.equal(campaignEndedBefore("2026-10-23", VIEW), false)
    assert.equal(campaignEndedBefore("", VIEW), false)
  })

  it("ended line status is full-flight spend over line budget", () => {
    assert.equal(endedLineStatus(1_000, 3_100), "behind")
    assert.equal(endedLineStatus(3_050, 3_100), "on-track")
    assert.equal(endedLineStatus(4_000, 3_100), "over-pacing")
    assert.equal(endedLineStatus(100, 0), "no-data")
  })
})

describe("channel composer master gate", () => {
  it("keeps ended-within-a-week campaigns and drops older ones", () => {
    const kept = filterLiveMasters(
      [
        master("penfold015", "approved", "2026-07-23", "2026-10-19"),
        master("qatar003", "approved", "2026-10-06", "2026-10-18"),
        master("sthaus002", "booked", "2026-09-28", "2026-10-14"),
        master("live001", "booked", "2026-10-01", "2026-10-31"),
        master("future001", "booked", "2026-10-24", "2026-10-31"),
        master("done001", "completed", "2026-09-01", "2026-10-20"),
        master("done002", "completed", "2026-09-01", "2026-10-10"),
        master("gone001", "cancelled", "2026-09-01", "2026-10-20"),
      ],
      VIEW,
      null,
    ).map((m) => m.mba_number)
    assert.deepEqual(kept, ["penfold015", "qatar003", "live001", "done001"])
  })
})

function endedSearch(spend: number) {
  return searchFixture({
    mbaNumber: "penfold015",
    lineItemId: "penfold015se1",
    campaignStatus: "approved",
    campaignStartDate: "2026-10-01",
    campaignEndDate: "2026-10-19",
    lineItemStartDate: "2026-10-01",
    lineItemEndDate: "2026-10-19",
    totalLineItemBudget: 1_900,
    spendToDateLineTotal: spend,
    spendYesterday: 0,
    currentBurst: null,
    currentBurstIndex: null,
    impressions: 1_000,
    clicks: 10,
    campaignEnded: true,
    lineItemStatus: endedLineStatus(spend, 1_900),
  })
}

describe("surfaces read an ended campaign against the full flight", () => {
  it("portfolio lists it, marks it ended, expected is the full flight", () => {
    const rows = assembleCampaignPacingRows({
      asOfDate: VIEW,
      countToDate: COUNT_TO,
      allowedClientSlugs: null,
      liveOnly: true,
      search: [endedSearch(1_000)],
      social: [],
      programmatic: [],
      adServing: [],
      direct: [],
      schedulesByMba: new Map([
        [
          "penfold015",
          {
            deliverySchedule: [
              {
                month: "October 2026",
                mediaCosts: { search: "$1,900.00" },
                mediaTotal: "$1,900.00",
                feeTotal: "$0.00",
                totalAmount: "$1,900.00",
              },
            ],
            campaignBudget: 1_900,
          },
        ],
      ]),
    })
    const row = rows.find((r) => r.mbaNumber === "penfold015")
    assert.ok(row)
    assert.equal(row.ended, true)
    assert.equal(row.daysLeft, 0)
    assert.equal(Math.round(row.expectedToDate), 1_900)
    assert.equal(row.pace, "behind")
    assert.match(row.why, /^Ended 2026-10-19\./)
    const digest = digestRowsFromPortfolioCampaigns(rows)
    assert.equal(digest[0]?.ended, true)
  })

  it("a campaign that ended 8 days ago is not on the portfolio", () => {
    const old = searchFixture({
      mbaNumber: "sthaus002",
      lineItemId: "sthaus002se1",
      campaignStatus: "booked",
      campaignStartDate: "2026-09-28",
      campaignEndDate: "2026-10-14",
    })
    const rows = assembleCampaignPacingRows({
      asOfDate: VIEW,
      countToDate: COUNT_TO,
      allowedClientSlugs: null,
      liveOnly: true,
      search: [old],
      social: [],
      programmatic: [],
      adServing: [],
      direct: [],
      schedulesByMba: new Map(),
    })
    assert.equal(rows.length, 0)
  })

  it("Overview reads the line total, not no data", () => {
    const row = endedSearch(1_000)
    const item = mapSpendRowToOverviewItem(
      "search",
      { ...row, campaignEnded: true, conversions: 0, revenue: 0 },
      COUNT_TO,
    )
    assert.equal(item.status, "behind")
    assert.equal(item.ended, true)
    assert.equal(item.budget, 1_900)
    assert.equal(item.spendToDate, 1_000)
  })

  it("digest fallback keeps the ended line and flags it", () => {
    const row = endedSearch(1_000)
    const rows = buildDigestCampaignRows([{ channel: "search", ...row }], COUNT_TO)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.ended, true)
    assert.equal(rows[0]?.band, "at-risk")
    assert.equal(Number(rows[0]?.deliveredPct?.toFixed(3)), 0.526)
  })

  it("line card carries the ended flag", () => {
    const card = lineCardFromSearch(endedSearch(1_000), COUNT_TO)
    assert.equal(card.ended, true)
  })
})
