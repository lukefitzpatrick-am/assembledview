import assert from "node:assert/strict"
import test from "node:test"
import { deliverablesFromLineItem, groupLineItemsForKPI } from "../grouping.js"
import { extractKPIKeys } from "../matching.js"
import { resolveKPIsForMediaType } from "../resolve.js"

test("deliverablesFromLineItem sums burst calculatedValue (media-container shape)", () => {
  const item = {
    line_item_id: "MBA1RAD1",
    bursts: [
      { budget: "25000", buyAmount: "50", calculatedValue: 500 },
    ],
  }
  assert.equal(deliverablesFromLineItem(item as any), 500)
})

test("deliverablesFromLineItem reads top-level deliverables (export burst rows)", () => {
  const item = {
    line_item_id: "MBA1RAD1",
    deliverables: 250,
    grossMedia: "10000",
  }
  assert.equal(deliverablesFromLineItem(item as any), 250)
})

test("groupLineItemsForKPI aggregates burst deliverables for media-container rows", () => {
  const [grouped] = groupLineItemsForKPI(
    [
      {
        line_item_id: "MBA1RAD1",
        platform: "kiis",
        bidStrategy: "spots",
        buyType: "spots",
        totalMedia: 25000,
        bursts: [{ calculatedValue: 500 }],
      } as any,
    ],
    { mbaNumber: "MBA1", mediaType: "radio" },
  )
  assert.equal(grouped.deliverables, 500)
  assert.equal(grouped.spend, 25000)
})

test("resolveKPIsForMediaType derives est. clicks from burst deliverables × CTR", () => {
  const impressions = 1_000_000
  const ctr = 0.0143
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1SOC1",
        platform: "meta",
        bidStrategy: "reach",
        buyType: "cpm",
        site: "meta",
        grossMedia: "20000",
        bursts: [{ budget: "20000", buyAmount: "20", calculatedValue: impressions }],
      } as any,
    ],
    mediaType: "socialMedia",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [],
    clientKPIs: [],
    savedCampaignKPIs: [
      {
        mp_client_name: "Acme",
        mba_number: "MBA1",
        version_number: 1,
        campaign_name: "Camp",
        media_type: "socialMedia",
        publisher: "meta",
        bid_strategy: "reach",
        ctr,
        cpv: null,
        conversion_rate: null,
        vtr: null,
        frequency: null,
      },
    ],
  })

  assert.equal(row.deliverables, impressions)
  assert.equal(row.calculatedClicks, Math.round(impressions * ctr))
})

test("resolveKPIsForMediaType: spots line with persisted burst calculatedValue", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1RAD1",
        platform: "kiis",
        bidStrategy: "spots",
        buyType: "spots",
        station: "kiis",
        totalMedia: 25000,
        bursts: [{ budget: "25000", buyAmount: "50", calculatedValue: 500 }],
      } as any,
    ],
    mediaType: "radio",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.deliverables, 500)
})

test("groupLineItemsForKPI carries publisher from BVOD media-container rows", () => {
  const [grouped] = groupLineItemsForKPI(
    [
      {
        line_item_id: "MBA1BVD1",
        publisher: "Nine",
        platform: "Nine",
        site: "9Now",
        bid_strategy: "reach",
        buy_type: "cpm",
        totalMedia: 10000,
        bursts: [{ calculatedValue: 100000 }],
      } as any,
    ],
    { mbaNumber: "MBA1", mediaType: "bvod" },
  )

  assert.equal(grouped.publisher, "Nine")
  const keys = extractKPIKeys(grouped, "bvod")
  assert.equal(keys.publisher, "nine")
})

test("resolveKPIsForMediaType: BVOD publisher field resolves publisher KPI row", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1BVD1",
        publisher: "Nine",
        platform: "Nine",
        site: "9Now",
        bid_strategy: "reach",
        buy_type: "cpm",
        totalMedia: 10000,
        bursts: [{ calculatedValue: 100000 }],
      } as any,
    ],
    mediaType: "bvod",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [
      {
        id: 1,
        created_at: 0,
        media_type: "bvod",
        publisher: "Nine",
        bid_strategy: "reach",
        ctr: 0,
        cpv: 0,
        conversion_rate: 0,
        vtr: 0.85,
        frequency: 0,
      },
    ],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.publisher, "nine")
  assert.equal(row.source, "publisher")
  assert.equal(row.hasPublisherKpi, true)
  assert.equal(row.vtr, 0.85)
})
