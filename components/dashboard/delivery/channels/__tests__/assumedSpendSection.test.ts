import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildPlanOnlyRemainderSection } from "../planOnlyAdapter"
import { buildAssumedSpendSection } from "../assumedSpendAdapter"
import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import {
  applyAssumedToHubTotals,
  directSpendWithAssumed,
} from "@/lib/delivery/deliveredTotals"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const AS_OF = "2026-10-12"

describe("assumed spend dashboard section", () => {
  it("renders an ATL section with the label and no delivery counts", () => {
    const section = buildAssumedSpendSection({
      key: "assumed-spend",
      lineItems: [
        {
          line_item_id: "golf025RA1",
          sourceTable: "media_plan_radio",
          mediaTypeLabel: "Radio",
          buy_type: "spots",
          platform: "Nova",
          bursts: [{ budget: 1000, startDate: "2026-10-01", endDate: "2026-10-01" }],
        },
      ],
      campaignStart: "2026-07-01",
      campaignEnd: "2026-12-31",
      lastSyncedAt: null,
      asOfDate: AS_OF,
    })
    assert.ok(section)
    assert.equal(section.title, "Assumed spend")
    assert.equal(section.aggregate.progressCards[0]?.title, "Assumed spend")
    assert.equal(section.aggregate.progressCards[0]?.progress, 1)
    const text = JSON.stringify(section)
    assert.equal(text.includes("Impressions"), false)
    assert.equal(text.includes("Clicks"), false)
    assert.equal(text.includes("CPM"), false)

    const awaiting = buildPlanOnlyRemainderSection({
      lineItems: [{ line_item_id: "golf025SM9", platform: "Meta", bursts: [{ budget: 10 }] }],
      campaignStart: "2026-07-01",
      campaignEnd: "2026-12-31",
      lastSyncedAt: null,
    })
    assert.equal(awaiting?.title, "Awaiting delivery")
  })

  it("renders assumed spend when a direct-digital plan has no ad-serving rows", () => {
    const section = buildDirectDigitalChannelSection({
      key: "bvod",
      title: "BVOD",
      lineItems: [
        {
          line_item_id: "golf025BV9",
          buy_type: "cpm",
          no_adserving: true,
          platform: "not-a-delivery-source",
          bursts: [{ budget: 500, startDate: "2026-10-01", endDate: "2026-10-01" }],
        },
      ],
      combinedRows: [],
      campaignStart: "2026-07-01",
      campaignEnd: "2026-12-31",
      mbaNumber: "golf025",
      filterRange: { start: null, end: null },
      kpiVersionNumber: 1,
      lineItemTargets: undefined,
      lastSyncedAt: null,
      asOfDate: AS_OF,
    })
    assert.ok(section)
    assert.equal(section.title, "Assumed spend")
    assert.equal(section.key, "bvod")
    assert.equal(JSON.stringify(section).includes("Impressions"), false)
  })

  it("keeps the current section when ad-serving rows exist", () => {
    const row: PacingRow = {
      channel: "ad-serving",
      dateDay: "2026-10-01",
      adsetName: null,
      entityName: "Preroll",
      campaignId: null,
      campaignName: null,
      adsetId: null,
      entityId: "plc-1",
      lineItemId: "golf025BV1",
      amountSpent: 0,
      impressions: 800,
      clicks: 10,
      results: 0,
      video3sViews: 0,
      maxFivetranSyncedAt: null,
      updatedAt: null,
    }
    const section = buildDirectDigitalChannelSection({
      key: "bvod",
      title: "BVOD",
      lineItems: [
        {
          line_item_id: "golf025BV1",
          buy_type: "cpm",
          no_adserving: true,
          platform: "not-a-delivery-source",
          bursts: [{ budget: 500, startDate: "2026-10-01", endDate: "2026-10-01", calculatedValue: 1000 }],
        },
      ],
      combinedRows: [row],
      campaignStart: "2026-07-01",
      campaignEnd: "2026-12-31",
      mbaNumber: "golf025",
      filterRange: { start: null, end: null },
      kpiVersionNumber: 1,
      lineItemTargets: undefined,
      lastSyncedAt: null,
      asOfDate: AS_OF,
    })
    assert.ok(section)
    assert.equal(section.title, "BVOD")
    assert.equal(section.aggregate.chart.series.some((series) => series.label === "Impressions"), true)
  })
})

describe("hub assumed totals", () => {
  it("counts assumed in delivered once and reduces booked by the same amount", () => {
    const group = {
      totalReported: 1000,
      lineItems: [
        {
          lineItemId: "golf025SM1",
          totalReported: 800,
          daily: [{ dateDay: "2026-10-01", reportedSpend: 800, capApplied: "actual" }],
        },
        {
          lineItemId: "golf025RA1",
          totalReported: 200,
          daily: [{ dateDay: "2026-10-01", reportedSpend: 200, capApplied: "assumed_spend" }],
        },
      ],
    }
    const part = directSpendWithAssumed(group, null, null, new Set())
    assert.equal(part.spend, 1000)
    assert.equal(part.assumedSpend, 200)
    assert.equal(part.assumedInBooked, 200)

    const hub = applyAssumedToHubTotals({
      deliveredSpend: part.spend,
      bookedNoPlatform: 500,
      assumedSpend: part.assumedSpend,
      assumedInBooked: part.assumedInBooked,
    })
    assert.equal(hub.deliveredSpend, 1000)
    assert.equal(hub.bookedNoPlatform, 300)
    assert.equal(hub.assumedSpend, 200)
  })

  it("does not add assumed dollars that the snapshot already counted", () => {
    const group = {
      totalReported: 1000,
      lineItems: [
        {
          lineItemId: "golf025BV1",
          totalReported: 200,
          daily: [{ dateDay: "2026-10-01", reportedSpend: 200, capApplied: "assumed_spend" }],
        },
      ],
    }
    const exclude = new Set(["golf025bv1"])
    const already = directSpendWithAssumed(
      group,
      null,
      null,
      exclude,
      new Map([["golf025bv1", 200]]),
    )
    assert.equal(already.spend, 0)
    assert.equal(already.assumedSpend, 0)

    const missing = directSpendWithAssumed(group, null, null, exclude, new Map([["golf025bv1", 0]]))
    assert.equal(missing.spend, 200)
    assert.equal(missing.assumedSpend, 200)
    assert.equal(missing.assumedInBooked, 0)
    const hub = applyAssumedToHubTotals({
      deliveredSpend: 800 + missing.spend,
      bookedNoPlatform: 500,
      assumedSpend: missing.assumedSpend,
      assumedInBooked: missing.assumedInBooked,
    })
    assert.equal(hub.deliveredSpend, 1000)
    assert.equal(hub.bookedNoPlatform, 500)
  })
})
