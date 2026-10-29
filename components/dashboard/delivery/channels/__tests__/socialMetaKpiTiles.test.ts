/**
 * Meta delivery KPI tiles read their status from the KPI band (the MBA
 * review resolver), not the old 8% compareRateStatus (C4), and the View
 * rate tile compares 3-second views ÷ impressions to the VTR target (C1b).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildSocialMetaSection } from "../socialMetaAdapter"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import { lineItemKpiKey } from "@/lib/kpi/lineItemKpiTargets"
import type { CampaignKPI } from "@/lib/kpi/types"

const CAMPAIGN_START = "2026-08-01"
const CAMPAIGN_END = "2026-09-30"

function metaLine(): SocialLineItem {
  return {
    line_item_id: "bicau006sm1",
    platform: "Meta",
    buy_type: "Video views",
    creative_targeting: "Prospecting",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        media_investment: 5000,
        deliverables: 200_000,
        budget_number: 5000,
      },
    ],
  }
}

function metaRow(): CombinedPacingRow {
  return {
    channel: "meta",
    dateDay: "2026-09-15",
    adsetName: "Meta prospecting",
    entityName: "Meta prospecting",
    campaignId: null,
    campaignName: "BICAU006",
    adsetId: "as-1",
    entityId: "as-1",
    lineItemId: "bicau006sm1",
    amountSpent: 2000,
    impressions: 100_000,
    clicks: 920,
    results: 10,
    video3sViews: 40_000,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

function kpi(partial: Partial<CampaignKPI>): CampaignKPI {
  return {
    mp_client_name: "Test",
    mba_number: "BICAU006",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "socialmedia",
    publisher: "meta",
    bid_strategy: "cpm",
    line_item_id: "bicau006sm1",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...partial,
  }
}

test("Meta CTR 8% under target is on track (review band), View rate uses 3-second views", () => {
  const row = kpi({ ctr: 0.01, vtr: 0.5 })
  const lineItemTargets = new Map([[lineItemKpiKey("BICAU006", 1, "bicau006sm1"), row]])
  const section = buildSocialMetaSection({
    lineItems: [metaLine()],
    snowflakeRows: [metaRow()],
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "BICAU006",
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets,
    filterRange: { start: null, end: null },
    lastSyncedAt: null,
    isAdmin: true,
  })
  const tiles = section.aggregate.kpiBand.tiles
  const ctr = tiles.find((t) => t.label === "CTR")
  // 0.92% vs 1.00% is 92% of target: on track in the 90-110 band (the old 8% rule said behind).
  assert.equal(ctr?.value, "0.92%")
  assert.equal(ctr?.expected, "1.00%")
  assert.equal(ctr?.status, "on-track")

  const viewRate = tiles.find((t) => t.label === "View rate")
  assert.equal(viewRate?.value, "40.00%")
  assert.equal(viewRate?.expected, "50.00%")
  assert.equal(viewRate?.status, "behind")
})

test("C7: Meta CPM tile target is the review plan rate (buyAmount), not media ÷ deliverables", () => {
  const line: SocialLineItem = {
    ...metaLine(),
    buy_type: "CPM",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        media_investment: 5000,
        deliverables: 400_000,
        budget_number: 5000,
        startDate: CAMPAIGN_START,
        endDate: CAMPAIGN_END,
        budget: 5000,
        buyAmount: 12,
        mediaAmount: 5000,
        calculatedValue: 400_000,
      },
    ] as unknown as SocialLineItem["bursts"],
  }
  const section = buildSocialMetaSection({
    lineItems: [line],
    snowflakeRows: [metaRow()],
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "BICAU006",
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: new Map(),
    filterRange: { start: null, end: null },
    lastSyncedAt: null,
    isAdmin: true,
  })
  const cpm = section.aggregate.kpiBand.tiles.find((t) => t.label === "CPM")
  // Old burst path: $5,000 ÷ 400,000 × 1000 = $12.50. Review plan rate: buyAmount $12.00.
  assert.equal(cpm?.expected, "$12.00")
  assert.equal(cpm?.caption, "plan rate")
  assert.equal(cpm?.value, "$20.00")
  assert.equal(cpm?.status, "behind")
})

test("REP-5: a Meta click tracker is out of planned impressions and CPM; the whole delivery decides", () => {
  const cpmLine = (id: string): SocialLineItem => ({
    ...metaLine(),
    line_item_id: id,
    buy_type: "CPM",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        media_investment: 5000,
        deliverables: 400_000,
        budget_number: 5000,
      },
    ],
  })
  const rows: CombinedPacingRow[] = [
    { ...metaRow(), lineItemId: "bicau006sm1", amountSpent: 2000, impressions: 100_000, clicks: 900 },
    // sm2 has clicks and no impressions across its whole delivery: a click tracker.
    { ...metaRow(), lineItemId: "bicau006sm2", adsetId: "as-2", entityId: "as-2", amountSpent: 3000, impressions: 0, clicks: 400 },
  ]
  const section = buildSocialMetaSection({
    lineItems: [cpmLine("bicau006sm1"), cpmLine("bicau006sm2")],
    snowflakeRows: rows,
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "BICAU006",
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: new Map(),
    filterRange: { start: null, end: null },
    lastSyncedAt: null,
    isAdmin: true,
  })
  const card = section.aggregate.progressCards.find((c) => /delivery$/.test(c.title) && c.title !== "Spend delivery")
  assert.ok(card)
  assert.equal(card.plannedTotal, 400_000)
  assert.match(card.detail ?? "", /No impression tracking on 1 line/)
  // $2,000 over 100,000 impressions = $20.00 CPM, not $5,000.
  assert.equal(section.aggregate.summaryChips.find((c) => c.label === "Avg CPM")?.value, "$20.00")
  assert.equal(section.aggregate.kpiBand.tiles.find((t) => t.label === "CPM")?.value, "$20.00")

  // Filter to 1 to 10 September: sm1's 15 September impressions are outside, but its
  // whole delivery has impressions, so it stays tracked.
  const filtered = buildSocialMetaSection({
    lineItems: [cpmLine("bicau006sm1")],
    snowflakeRows: [
      { ...metaRow(), dateDay: "2026-09-05", amountSpent: 10, impressions: 0, clicks: 4 },
      metaRow(),
    ],
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "BICAU006",
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: new Map(),
    filterRange: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 10) },
    lastSyncedAt: null,
    isAdmin: true,
  })
  const filteredCard = filtered.aggregate.progressCards.find((c) => /delivery$/.test(c.title) && c.title !== "Spend delivery")
  assert.ok(filteredCard)
  assert.doesNotMatch(filteredCard.detail ?? "", /No impression tracking/)
})
