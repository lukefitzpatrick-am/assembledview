import assert from "node:assert/strict"
import test from "node:test"
import type { LineItem } from "../../generateMediaPlan.js"
import type { Publisher } from "../../types/publisher.js"
import type { CampaignKPI, ClientKPI, PublisherKPI } from "../types.js"
import { resolveKPIsForMediaType } from "../resolve.js"

function lineItem(over: Partial<LineItem> = {}): LineItem {
  return {
    market: "",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    deliverables: 1000,
    deliverablesAmount: "0",
    grossMedia: "100",
    lineItemId: "L1",
    site: "acme",
    bidStrategy: "clicks",
    buyType: "cpc",
    ...over,
  } as LineItem
}

const baseKpi = {
  bid_strategy: "clicks",
  cpv: 0,
  vtr: 0,
  frequency: 0,
} as const

function test1_savedWins() {
  const li = lineItem()
  const saved: CampaignKPI = {
    mp_client_name: "c",
    mba_number: "M1",
    version_number: 1,
    campaign_name: "camp",
    media_type: "digitalDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.05,
    conversion_rate: 0.01,
  }
  const client: ClientKPI = {
    id: 1,
    created_at: 0,
    mp_client_name: "c",
    publisher_name: "acme",
    media_type: "digiDisplay",
    ...baseKpi,
    ctr: 0.03,
    conversion_rate: 0.02,
  }
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.02,
    conversion_rate: 0.4,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [saved],
    clientKPIs: [client],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0.05)
  assert.equal(row.source, "saved")
}

test("1. Campaign-saved wins for CTR (saved 0.05, client 0.03, publisher 0.02)", () => {
  test1_savedWins()
})

test("2. Campaign CTR 0 falls through to client (0.03) when publisher is 0.02", () => {
  const li = lineItem()
  const saved: CampaignKPI = {
    mp_client_name: "c",
    mba_number: "M1",
    version_number: 1,
    campaign_name: "camp",
    media_type: "digitalDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0,
    conversion_rate: 0,
  }
  const client: ClientKPI = {
    id: 1,
    created_at: 0,
    mp_client_name: "c",
    publisher_name: "acme",
    media_type: "digiDisplay",
    ...baseKpi,
    ctr: 0.03,
    conversion_rate: 0,
  }
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.02,
    conversion_rate: 0,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [saved],
    clientKPIs: [client],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0.03)
  assert.equal(row.source, "client")
})

test("3. No saved, no client, publisher-only CTR 0.02", () => {
  const li = lineItem()
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.02,
    conversion_rate: 0,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0.02)
  assert.equal(row.source, "publisher")
})

test("4. Publisher tier accepts CTR 0 (no client/saved, publisher match)", () => {
  const li = lineItem()
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0,
    conversion_rate: 0,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0)
  assert.equal(row.source, "publisher")
})

test("5. All missing at every tier => default, CTR 0", () => {
  const li = lineItem()
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [],
  })
  assert.equal(row.ctr, 0)
  assert.equal(row.source, "default")
})

test("6. CPV derived from buyType containing cpv: spend 100, deliverables 1000 => 0.1; non-CPV => 0", () => {
  const liCpv = lineItem({
    buyType: "cpv",
    grossMedia: "100",
    deliverables: 1000,
  })
  const [rowC] = resolveKPIsForMediaType({
    lineItems: [liCpv],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [],
  })
  assert.equal(rowC.cpv, 0.1)

  const [rowN] = resolveKPIsForMediaType({
    lineItems: [lineItem({ buyType: "cpt", grossMedia: "100", deliverables: 1000 })],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [],
  })
  assert.equal(rowN.cpv, 0)
})

test("7. Publisher id field maps to display name on line item via publishers list", () => {
  const li = lineItem({ site: "ten network" })
  const publishers: Publisher[] = [
    { publisherid: "pub_123", publisher_name: "ten network" } as unknown as Publisher,
  ]
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "pub_123",
    ...baseKpi,
    ctr: 0.07,
    conversion_rate: 0,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [pub],
    publishers,
  })
  assert.equal(row.ctr, 0.07)
  assert.equal(row.source, "publisher")
})

test("8. Media type alias: row digitalDisplay matches digiDisplay resolver", () => {
  const li = lineItem()
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digitalDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.11,
    conversion_rate: 0,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [],
    clientKPIs: [],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0.11)
})

test("9. Per-metric: CTR from saved, conversion_rate from client, vtr from publisher", () => {
  const li = lineItem()
  const saved: CampaignKPI = {
    mp_client_name: "c",
    mba_number: "M1",
    version_number: 1,
    campaign_name: "camp",
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.05,
    conversion_rate: 0,
    vtr: 0,
  }
  const client: ClientKPI = {
    id: 1,
    created_at: 0,
    mp_client_name: "c",
    publisher_name: "acme",
    media_type: "digiDisplay",
    ...baseKpi,
    ctr: 0.99,
    conversion_rate: 0.2,
  }
  const pub: PublisherKPI = {
    id: 1,
    created_at: 0,
    media_type: "digiDisplay",
    publisher: "acme",
    ...baseKpi,
    ctr: 0.11,
    conversion_rate: 0.99,
    vtr: 0.3,
  }
  const [row] = resolveKPIsForMediaType({
    lineItems: [li],
    mediaType: "digiDisplay",
    clientName: "c",
    mbaNumber: "M1",
    versionNumber: 1,
    campaignName: "camp",
    savedCampaignKPIs: [saved],
    clientKPIs: [client],
    publisherKPIs: [pub],
  })
  assert.equal(row.ctr, 0.05)
  assert.equal(row.conversion_rate, 0.2)
  assert.equal(row.vtr, 0.3)
  assert.equal(row.source, "saved")
})
