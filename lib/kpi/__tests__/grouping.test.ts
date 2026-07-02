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

test("groupLineItemsForKPI: digiDisplay publisher maps to publisher key (not site)", () => {
  const [grouped] = groupLineItemsForKPI(
    [
      {
        line_item_id: "MBA1DD1",
        publisher: "SBS",
        platform: "SBS",
        site: "sbs.com.au",
        buy_type: "cpm",
        bid_strategy: "cpm",
        totalMedia: 5000,
        bursts: [{ calculatedValue: 50000 }],
      } as any,
    ],
    { mbaNumber: "MBA1", mediaType: "digiDisplay" },
  )

  const keys = extractKPIKeys(grouped, "digiDisplay")
  assert.equal(keys.publisher, "sbs")
  assert.equal(keys.bidStrategy, "cpm")
})

test("resolveKPIsForMediaType: digiDisplay publisher KPI matches platform publisher", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1DD1",
        publisher: "SBS",
        platform: "SBS",
        site: "sbs.com.au",
        buy_type: "cpm",
        bid_strategy: "cpm",
        totalMedia: 5000,
        bursts: [{ calculatedValue: 50000 }],
      } as any,
    ],
    mediaType: "digiDisplay",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [
      {
        id: 1,
        created_at: 0,
        media_type: "digitalDisplay",
        publisher: "sbs",
        bid_strategy: "cpm",
        ctr: 0.0012,
        cpv: 0,
        conversion_rate: 0,
        vtr: 0,
        frequency: 0,
      },
    ],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.publisher, "sbs")
  assert.equal(row.source, "publisher")
  assert.equal(row.hasPublisherKpi, true)
  assert.equal(row.calculatedClicks, Math.round(50000 * 0.0012))
})

test("groupLineItemsForKPI: digiVideo carries bid_strategy for KPI join", () => {
  const [grouped] = groupLineItemsForKPI(
    [
      {
        line_item_id: "MBA1DV1",
        publisher: "Nine",
        platform: "Nine",
        site: "9Now",
        bid_strategy: "cpv",
        buy_type: "cpv",
        totalMedia: 8000,
        bursts: [{ calculatedValue: 4000 }],
      } as any,
    ],
    { mbaNumber: "MBA1", mediaType: "digiVideo" },
  )

  const keys = extractKPIKeys(grouped, "digiVideo")
  assert.equal(keys.publisher, "nine")
  assert.equal(keys.bidStrategy, "cpv")
})

test("resolveKPIsForMediaType: digiVideo CPV buy type uses deliverables as views", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1DV1",
        publisher: "Nine",
        site: "9Now",
        bid_strategy: "cpv",
        buy_type: "cpv",
        totalMedia: 8000,
        bursts: [{ calculatedValue: 4000 }],
      } as any,
    ],
    mediaType: "digiVideo",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.calculatedViews, 4000)
  assert.equal(row.cpv, 2)
})

test("groupLineItemsForKPI: digiAudio maps publisher from site", () => {
  const [grouped] = groupLineItemsForKPI(
    [
      {
        line_item_id: "MBA1DA1",
        publisher: "Spotify",
        site: "Spotify AU",
        bid_strategy: "cpm",
        buy_type: "cpm",
        totalMedia: 3000,
        bursts: [{ calculatedValue: 100000 }],
      } as any,
    ],
    { mbaNumber: "MBA1", mediaType: "digiAudio" },
  )

  const keys = extractKPIKeys(grouped, "digiAudio")
  assert.equal(keys.publisher, "spotify")
})

test("resolveKPIsForMediaType: influencers bid_strategy joins publisher KPI", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1INF1",
        platform: "TikTok",
        bid_strategy: "cpm",
        buy_type: "cpm",
        totalMedia: 12000,
        bursts: [{ calculatedValue: 200000 }],
      } as any,
    ],
    mediaType: "influencers",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [
      {
        id: 1,
        created_at: 0,
        media_type: "influencers",
        publisher: "TikTok",
        bid_strategy: "cpm",
        ctr: 0.02,
        cpv: 0,
        conversion_rate: 0,
        vtr: 0,
        frequency: 3,
      },
    ],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.source, "publisher")
  assert.equal(row.hasPublisherKpi, true)
  assert.equal(row.frequency, 3)
})

test("resolveKPIsForMediaType: integration platform resolves publisher KPI", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1INT1",
        platform: "Pedestrian",
        bid_strategy: "fixed_cost",
        buy_type: "fixed_cost",
        totalMedia: 15000,
        bursts: [{ calculatedValue: 1 }],
      } as any,
    ],
    mediaType: "integration",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [
      {
        id: 1,
        created_at: 0,
        media_type: "integration",
        publisher: "Pedestrian",
        bid_strategy: "fixed_cost",
        ctr: 0,
        cpv: 0,
        conversion_rate: 0,
        vtr: 0,
        frequency: 2.5,
      },
    ],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.publisher, "pedestrian")
  assert.equal(row.source, "publisher")
  assert.equal(row.calculatedReach, 0)
})

test("resolveKPIsForMediaType: search manual_cpc buy type treats deliverables as clicks", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1SE1",
        platform: "Google",
        bid_strategy: "manual_cpc",
        buy_type: "manual_cpc",
        totalMedia: 9000,
        bursts: [{ calculatedValue: 4500 }],
      } as any,
    ],
    mediaType: "search",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.calculatedClicks, 4500)
})

test("resolveKPIsForMediaType: progVideo CPV buy type treats deliverables as views", () => {
  const [row] = resolveKPIsForMediaType({
    lineItems: [
      {
        line_item_id: "MBA1PV1",
        platform: "DV360",
        bid_strategy: "completed_views",
        buy_type: "cpv",
        totalMedia: 6000,
        bursts: [{ calculatedValue: 3000 }],
      } as any,
    ],
    mediaType: "progVideo",
    clientName: "Acme",
    mbaNumber: "MBA1",
    versionNumber: 1,
    campaignName: "Camp",
    publisherKPIs: [],
    clientKPIs: [],
    savedCampaignKPIs: [],
  })

  assert.equal(row.calculatedViews, 3000)
})
