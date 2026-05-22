import { describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { aggregateForLineItem, emptyKpis } from "../aggregate"
import type { SearchCampaignsPacingRawRow } from "@/lib/snowflake/search-campaigns-pacing"

const windows = {
  lineTotalStart: "2026-01-01",
  lineTotalEnd: "2026-05-22",
  currentBurstStart: "2026-05-01",
  currentBurstEnd: "2026-05-31",
  yesterday: "2026-05-21",
}

describe("aggregateForLineItem", () => {
  it("returns empty when no rows", () => {
    const result = aggregateForLineItem([], windows)
    assert.equal(result.platformCampaigns.length, 0)
    assert.deepEqual(result.lineItemKpis, emptyKpis())
  })

  it("groups by campaign then ad group", () => {
    const rows = [
      makeRow("li1", "c1", "Camp 1", "ag1", "Ad Group 1", "2026-03-15", {
        spend: 100,
        impressions: 1000,
        clicks: 50,
      }),
      makeRow("li1", "c1", "Camp 1", "ag1", "Ad Group 1", "2026-05-21", {
        spend: 50,
        impressions: 500,
        clicks: 25,
      }),
      makeRow("li1", "c1", "Camp 1", "ag2", "Ad Group 2", "2026-05-10", {
        spend: 25,
        impressions: 250,
        clicks: 10,
      }),
      makeRow("li1", "c2", "Camp 2", "ag3", "Ad Group 3", "2026-04-01", {
        spend: 200,
        impressions: 2000,
        clicks: 100,
      }),
    ]
    const result = aggregateForLineItem(rows, windows)

    assert.equal(result.platformCampaigns.length, 2)
    assert.equal(result.lineItemKpis.spendToDateLineTotal, 375)
    assert.equal(result.lineItemKpis.impressions, 3750)
    assert.equal(result.lineItemKpis.clicks, 185)
    assert.ok(Math.abs((result.lineItemKpis.cpc ?? 0) - 375 / 185) < 1e-9)
    assert.equal(result.lineItemKpis.spendYesterday, 50)
    assert.equal(result.lineItemKpis.spendToDateCurrentBurst, 75)
  })

  it("returns null ratios when denominators are zero", () => {
    const rows = [
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-03-15", { spend: 100, impressions: 0, clicks: 0 }),
    ]
    const result = aggregateForLineItem(rows, windows)
    assert.equal(result.lineItemKpis.cpc, null)
    assert.equal(result.lineItemKpis.ctr, null)
    assert.equal(result.lineItemKpis.cpm, null)
  })

  it("excludes yesterday bucket when no row matches", () => {
    const rows = [
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-05-10", { spend: 100, impressions: 100, clicks: 5 }),
    ]
    const result = aggregateForLineItem(rows, windows)
    assert.equal(result.lineItemKpis.spendYesterday, 0)
  })

  it("excludes current burst bucket when row is outside burst window", () => {
    const rows = [
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-03-15", { spend: 100, impressions: 100, clicks: 5 }),
    ]
    const result = aggregateForLineItem(rows, windows)
    assert.equal(result.lineItemKpis.spendToDateCurrentBurst, 0)
    assert.equal(result.lineItemKpis.spendToDateLineTotal, 100)
  })

  it("excludes current burst bucket when no burst is active", () => {
    const noBurst = { ...windows, currentBurstStart: null, currentBurstEnd: null }
    const rows = [
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-05-10", { spend: 100, impressions: 100, clicks: 5 }),
    ]
    const result = aggregateForLineItem(rows, noBurst)
    assert.equal(result.lineItemKpis.spendToDateCurrentBurst, 0)
  })

  it("KPIs aggregate from sums, not averaged ratios", () => {
    const rows = [
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-03-15", { spend: 90, impressions: 1000, clicks: 90 }),
      makeRow("li1", "c1", "C", "ag1", "AG", "2026-03-16", { spend: 10, impressions: 100, clicks: 1 }),
    ]
    const result = aggregateForLineItem(rows, windows)
    assert.ok(Math.abs((result.lineItemKpis.cpc ?? 0) - 100 / 91) < 1e-9)
  })
})

function makeRow(
  lineItemId: string,
  campaignId: string,
  campaignName: string,
  platformLineItemId: string,
  lineItemName: string,
  dateDay: string,
  metrics: { spend: number; impressions: number; clicks: number; conversions?: number; revenue?: number },
): SearchCampaignsPacingRawRow {
  return {
    LINE_ITEM_ID: lineItemId,
    CAMPAIGN_ID: campaignId,
    CAMPAIGN_NAME: campaignName,
    PLATFORM_LINE_ITEM_ID: platformLineItemId,
    LINE_ITEM_NAME: lineItemName,
    DATE_DAY: dateDay,
    AMOUNT_SPENT: metrics.spend,
    IMPRESSIONS: metrics.impressions,
    CLICKS: metrics.clicks,
    CONVERSIONS: metrics.conversions ?? 0,
    REVENUE: metrics.revenue ?? 0,
  }
}
