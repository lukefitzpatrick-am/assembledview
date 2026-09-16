import assert from "node:assert/strict"
import test from "node:test"

import { buildPlanOnlyRemainderSection } from "../planOnlyAdapter"
import { buildSocialMetaSection } from "../socialMetaAdapter"
import { buildSocialRedditSection } from "../socialRedditAdapter"
import { buildSocialTiktokSection } from "../socialTiktokAdapter"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import { partitionRedditDeliveryLines } from "@/lib/delivery/social/partitionRedditDeliveryLines"

const CAMPAIGN_START = "2026-08-01"
const CAMPAIGN_END = "2026-09-30"

function redditLine(overrides: Partial<SocialLineItem> = {}): SocialLineItem {
  return {
    line_item_id: "bicau006sm2",
    platform: "Reddit",
    buy_type: "Video views",
    creative_targeting: "Prospecting",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        media_investment: 5000,
        deliverables: 20000,
        budget_number: 5000,
      },
    ],
    ...overrides,
  }
}

function redditRow(overrides: Partial<CombinedPacingRow> = {}): CombinedPacingRow {
  return {
    channel: "reddit",
    dateDay: "2026-09-15",
    adsetName: "Reddit prospecting",
    entityName: "Reddit prospecting",
    campaignId: null,
    campaignName: "BICAU006",
    adsetId: "ag-1",
    entityId: "ag-1",
    lineItemId: "bicau006sm2",
    amountSpent: 2730.67,
    impressions: 184_200,
    clicks: 410,
    results: 22,
    video3sViews: 12_450,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    ...overrides,
  }
}

const sharedInput = {
  campaignStart: CAMPAIGN_START,
  campaignEnd: CAMPAIGN_END,
  mbaNumber: "BICAU006",
  kpiVersionNumber: 1,
  kpiTargets: undefined,
  lineItemTargets: undefined,
  filterRange: { start: null, end: null },
  lastSyncedAt: null,
}

test("Reddit line with SOCIAL_PACING_FACT rows renders spend, impressions and 3s views", () => {
  const section = buildSocialRedditSection({
    lineItems: [redditLine()],
    snowflakeRows: [redditRow()],
    ...sharedInput,
  })

  assert.equal(section.key, "social-reddit")
  assert.equal(section.title, "Social – Reddit")
  assert.deepEqual(section.connections, [{ label: "Reddit connected", tone: "reddit" }])
  assert.equal(section.lineItems.length, 1)

  const spendChip = section.aggregate.summaryChips.find((chip) => chip.label === "Total spend")
  const impressionsChip = section.aggregate.summaryChips.find(
    (chip) => chip.label === "Total impressions",
  )
  assert.match(String(spendChip?.value), /2,730/)
  assert.match(String(impressionsChip?.value), /184,200/)

  const spendCard = section.lineItems[0]?.block.progressCards[0]
  assert.match(String(spendCard?.value), /2,730/)

  const kpiLabels = section.aggregate.kpiBand.tiles.map((tile) => tile.label)
  assert.deepEqual(
    kpiLabels.slice(0, 5),
    ["CPM", "CTR", "CPC", "CVR", "CPA"],
  )
  assert.equal(kpiLabels.includes("View rate"), true)
  assert.equal(kpiLabels.includes("CPV"), true)

  const viewRate = section.aggregate.kpiBand.tiles.find((tile) => tile.label === "View rate")
  const cpv = section.aggregate.kpiBand.tiles.find((tile) => tile.label === "CPV")
  assert.notEqual(viewRate?.value, "0.00%")
  assert.notEqual(cpv?.value, "$0.00")
})

test("Reddit line without rows goes to Awaiting delivery, not the Reddit adapter twice", () => {
  const items = [redditLine({ line_item_id: "bicau006sm1", buy_type: "Awareness" })]
  const { live, awaiting } = partitionRedditDeliveryLines(items, [])
  assert.deepEqual(live, [])

  const remainder = buildPlanOnlyRemainderSection({
    lineItems: awaiting,
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    lastSyncedAt: null,
  })
  assert.ok(remainder)
  assert.equal(remainder.key, "plan-only")
  assert.equal(remainder.title, "Awaiting delivery")
  assert.equal(remainder.lineItems.length, 1)
  assert.equal(remainder.lineItems[0]?.block.progressCards[0]?.detail, "No delivery data yet")
})

test("Meta adapter is unchanged", () => {
  const section = buildSocialMetaSection({
    lineItems: [
      redditLine({
        line_item_id: "bicau006sm3",
        platform: "Meta",
        buy_type: "Traffic",
      }),
    ],
    snowflakeRows: [
      redditRow({
        channel: "meta",
        lineItemId: "bicau006sm3",
        video3sViews: 0,
      }),
    ],
    ...sharedInput,
  })
  assert.equal(section.key, "social-meta")
  assert.equal(section.title, "Social – Meta")
  assert.deepEqual(section.connections, [{ label: "Meta connected", tone: "meta" }])
})

test("Reddit deliverable status is not no-data when delivered and planned are both > 0", () => {
  const section = buildSocialRedditSection({
    lineItems: [redditLine()],
    snowflakeRows: [redditRow()],
    ...sharedInput,
  })
  const deliverable = section.lineItems[0]?.block.progressCards[1]
  assert.ok(deliverable)
  assert.notEqual(deliverable.status, "no-data")
  assert.ok(
    deliverable.status === "ahead" ||
      deliverable.status === "behind" ||
      deliverable.status === "on-track",
  )
})

test("TikTok adapter is unchanged", () => {
  const section = buildSocialTiktokSection({
    lineItems: [
      redditLine({
        line_item_id: "bicau006sm4",
        platform: "TikTok",
        buy_type: "Video views",
      }),
    ],
    snowflakeRows: [
      redditRow({
        channel: "tiktok",
        lineItemId: "bicau006sm4",
      }),
    ],
    ...sharedInput,
  })
  assert.equal(section.key, "social-tiktok")
  assert.equal(section.title, "Social – TikTok")
  assert.deepEqual(section.connections, [{ label: "TikTok connected", tone: "tiktok" }])
})
