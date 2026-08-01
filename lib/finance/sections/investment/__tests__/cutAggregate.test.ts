import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  aggregateInvestmentCut,
  fn3aBillableTotalCents,
  type InvestmentCutFact,
} from "@/lib/finance/sections/investment/cutAggregate"
import {
  FEE_COVERAGE_CAVEAT,
  UNMATCHED_PUBLISHER,
  type InvestmentCutNormalized,
} from "@/lib/finance/sections/investment/cutTypes"
import { CHANNEL_TO_GROUP } from "@/lib/finance/sections/investment/channelGroups"
import { LINE_CHANNELS } from "@/db/schema/enums"

const DEFAULT_FILTERS: InvestmentCutNormalized["filters"] = {
  clients: [],
  channels: [],
  channelGroups: [],
  publishers: [],
  buyTypes: [],
  markets: [],
  billingAgency: [],
  search: "",
}

function base(
  q: Partial<Omit<InvestmentCutNormalized, "filters">> & {
    filters?: Partial<InvestmentCutNormalized["filters"]>
  } = {}
): InvestmentCutNormalized {
  return {
    fy: 2025,
    from: "2025-07",
    to: "2026-06",
    basis: "billing",
    dimensions: [],
    measures: ["media_cents", "fee_cents", "adserving_cents", "billable_cents"],
    ...q,
    filters: {
      ...DEFAULT_FILTERS,
      ...q.filters,
    },
  }
}

const fixtures: InvestmentCutFact[] = [
  {
    amountCents: 100_00,
    component: "media",
    basis: "billing",
    month: "2025-07-01",
    fy: 2025,
    clientId: 1,
    clientName: "Acme",
    campaignName: "Spring Push",
    mbaNumber: "mba-acme-1",
    lineItemId: "li-tv-1",
    channel: "television",
    market: "Sydney",
    buyType: "spot",
    clientPaysForMedia: false,
    publisherIdentity: "Nine",
    publisherBillingAgencyRaw: "advertising associates",
  },
  {
    amountCents: 20_00,
    component: "fee",
    basis: "billing",
    month: "2025-07-01",
    fy: 2025,
    clientId: 1,
    clientName: "Acme",
    campaignName: "Spring Push",
    mbaNumber: "mba-acme-1",
    lineItemId: "li-tv-1",
    channel: "television",
    market: "Sydney",
    buyType: "spot",
    clientPaysForMedia: false,
    publisherIdentity: "Nine",
    publisherBillingAgencyRaw: "advertising associates",
  },
  {
    amountCents: 5_00,
    component: "adserving",
    basis: "billing",
    month: "2025-07-01",
    fy: 2025,
    clientId: 1,
    clientName: "Acme",
    campaignName: "Spring Push",
    mbaNumber: "mba-acme-1",
    lineItemId: "li-tv-1",
    channel: "television",
    market: "Sydney",
    buyType: "spot",
    clientPaysForMedia: false,
    publisherIdentity: "Nine",
    publisherBillingAgencyRaw: "advertising associates",
  },
  {
    amountCents: 50_00,
    component: "media",
    basis: "billing",
    month: "2025-08-01",
    fy: 2025,
    clientId: 2,
    clientName: "Beta Co",
    campaignName: "Always On",
    mbaNumber: "mba-beta-2",
    lineItemId: "li-social-1",
    channel: "social",
    market: "Melbourne",
    buyType: "cpm",
    clientPaysForMedia: false,
    publisherIdentity: "Meta",
    publisherBillingAgencyRaw: "assembled media",
  },
  {
    amountCents: 10_00,
    component: "fee",
    basis: "billing",
    month: "2025-08-01",
    fy: 2025,
    clientId: 2,
    clientName: "Beta Co",
    campaignName: "Always On",
    mbaNumber: "mba-beta-2",
    lineItemId: "li-social-1",
    channel: "social",
    market: "Melbourne",
    buyType: "cpm",
    clientPaysForMedia: false,
    publisherIdentity: "Meta",
    publisherBillingAgencyRaw: "assembled media",
  },
  // Unmatched publisher + media-only (no fee) — fee coverage caveat path
  {
    amountCents: 30_00,
    component: "media",
    basis: "billing",
    month: "2025-09-01",
    fy: 2025,
    clientId: 2,
    clientName: "Beta Co",
    campaignName: "Legacy Wipe",
    mbaNumber: "mba-beta-legacy",
    lineItemId: "li-search-1",
    channel: "search",
    market: "National",
    buyType: null,
    clientPaysForMedia: false,
    publisherIdentity: null,
    publisherBillingAgencyRaw: null,
  },
  // Delivery twin + client-pays media (excluded from delivery billable)
  {
    amountCents: 100_00,
    component: "media",
    basis: "delivery",
    month: "2025-07-01",
    fy: 2025,
    clientId: 1,
    clientName: "Acme",
    campaignName: "Spring Push",
    mbaNumber: "mba-acme-1",
    lineItemId: "li-tv-1",
    channel: "television",
    market: "Sydney",
    buyType: "spot",
    clientPaysForMedia: false,
    publisherIdentity: "Nine",
    publisherBillingAgencyRaw: "advertising associates",
  },
  {
    amountCents: 40_00,
    component: "media",
    basis: "delivery",
    month: "2025-07-01",
    fy: 2025,
    clientId: 3,
    clientName: "Client Pays Inc",
    campaignName: "CPM Deal",
    mbaNumber: "mba-cp-3",
    lineItemId: "li-cp-1",
    channel: "prog_display",
    market: "Sydney",
    buyType: "programmatic",
    clientPaysForMedia: true,
    publisherIdentity: "Google",
    publisherBillingAgencyRaw: "advertising associates",
  },
  {
    amountCents: 8_00,
    component: "fee",
    basis: "delivery",
    month: "2025-07-01",
    fy: 2025,
    clientId: 3,
    clientName: "Client Pays Inc",
    campaignName: "CPM Deal",
    mbaNumber: "mba-cp-3",
    lineItemId: "li-cp-1",
    channel: "prog_display",
    market: "Sydney",
    buyType: "programmatic",
    clientPaysForMedia: true,
    publisherIdentity: "Google",
    publisherBillingAgencyRaw: "advertising associates",
  },
]

describe("channelGroups map", () => {
  it("covers every line_channel enum value", () => {
    for (const ch of LINE_CHANNELS) {
      assert.ok(ch in CHANNEL_TO_GROUP, `missing ${ch}`)
    }
  })
})

describe("aggregateInvestmentCut", () => {
  it("multi-dim groups client × channelGroup with correct cents", () => {
    const result = aggregateInvestmentCut(
      fixtures,
      base({
        basis: "billing",
        dimensions: ["client", "channelGroup"],
      })
    )
    assert.equal(result.truncated, false)
    assert.equal(result.totals.billable_cents, 100_00 + 20_00 + 5_00 + 50_00 + 10_00 + 30_00)
    assert.equal(result.totals.media_cents, 180_00)
    assert.equal(result.totals.fee_cents, 30_00)
    assert.equal(result.totals.adserving_cents, 5_00)

    const acmeBroadcast = result.rows.find(
      (r) => r.dims.client === "Acme" && r.dims.channelGroup === "Broadcast"
    )
    assert.ok(acmeBroadcast)
    assert.equal(acmeBroadcast!.measures.billable_cents, 125_00)

    const betaSocial = result.rows.find(
      (r) => r.dims.client === "Beta Co" && r.dims.channelGroup === "Social"
    )
    assert.ok(betaSocial)
    assert.equal(betaSocial!.measures.billable_cents, 60_00)

    // Deterministic order: Acme before Beta, then channelGroup alpha
    assert.equal(result.rows[0]!.dims.client, "Acme")
  })

  it("filters by channelGroups and billingAgency", () => {
    const result = aggregateInvestmentCut(
      fixtures,
      base({
        basis: "billing",
        dimensions: ["publisher"],
        filters: {
          channelGroups: ["Broadcast"],
          billingAgency: ["AA"],
        },
      })
    )
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0]!.dims.publisher, "Nine")
    assert.equal(result.totals.billable_cents, 125_00)
  })

  it("search matches MBA / campaign / publisher case-insensitively", () => {
    const byMba = aggregateInvestmentCut(
      fixtures,
      base({
        basis: "billing",
        dimensions: ["client"],
        filters: { search: "MBA-BETA" },
      })
    )
    assert.equal(byMba.rows.length, 1)
    assert.equal(byMba.rows[0]!.dims.client, "Beta Co")

    const byPub = aggregateInvestmentCut(
      fixtures,
      base({
        basis: "billing",
        dimensions: ["client"],
        filters: { search: "nine" },
      })
    )
    assert.equal(byPub.rows[0]!.dims.client, "Acme")
  })

  it("buckets null publisher identity as Unmatched", () => {
    const result = aggregateInvestmentCut(
      fixtures,
      base({
        basis: "billing",
        dimensions: ["publisher"],
        filters: { search: "legacy" },
      })
    )
    assert.equal(result.rows[0]!.dims.publisher, UNMATCHED_PUBLISHER)
    assert.equal(result.rows[0]!.measures.media_cents, 30_00)
  })

  it("never mixes bases — delivery excludes client-pays media", () => {
    const billing = aggregateInvestmentCut(fixtures, base({ basis: "billing", dimensions: [] }))
    const delivery = aggregateInvestmentCut(fixtures, base({ basis: "delivery", dimensions: [] }))
    assert.equal(billing.coverage.basis, "billing")
    assert.equal(delivery.coverage.basis, "delivery")
    // delivery: Nine media 100 + CP fee 8 (media 40 excluded)
    assert.equal(delivery.totals.billable_cents, 108_00)
    assert.equal(delivery.totals.media_cents, 100_00)
    assert.equal(delivery.totals.fee_cents, 8_00)
  })

  it("sets truncated when over row cap", () => {
    const many: InvestmentCutFact[] = []
    for (let i = 0; i < 12; i++) {
      many.push({
        ...fixtures[0]!,
        clientId: i + 1,
        clientName: `Client ${String(i).padStart(2, "0")}`,
        mbaNumber: `mba-${i}`,
        lineItemId: `li-${i}`,
      })
    }
    const result = aggregateInvestmentCut(
      many,
      base({ basis: "billing", dimensions: ["client"] }),
      { rowCap: 5 }
    )
    assert.equal(result.truncated, true)
    assert.equal(result.rows.length, 5)
    assert.equal(result.rowCap, 5)
  })

  it("exposes fee coverage meta with caveat when fee/billable requested", () => {
    const result = aggregateInvestmentCut(
      fixtures,
      base({ basis: "billing", dimensions: ["client"] })
    )
    assert.ok(result.coverage.fee)
    assert.equal(result.coverage.fee!.mediaLineMonths, 3) // tv, social, search
    assert.equal(result.coverage.fee!.feeLineMonths, 2) // search has no fee
    assert.equal(result.coverage.fee!.coveragePct, 66.7)
    assert.equal(result.coverage.fee!.caveat, FEE_COVERAGE_CAVEAT)
  })

  it("reconciles cut{dimensions:[client]} billable totals to FN3a composition", () => {
    for (const basis of ["billing", "delivery"] as const) {
      const cut = aggregateInvestmentCut(
        fixtures,
        base({ basis, dimensions: ["client"] })
      )
      const fn3a = fn3aBillableTotalCents(fixtures, basis)
      assert.equal(
        cut.totals.billable_cents,
        fn3a,
        `basis=${basis}: cut totals must equal FN3a billable`
      )
      const sumClients = cut.rows.reduce((s, r) => s + (r.measures.billable_cents ?? 0), 0)
      assert.equal(sumClients, fn3a)
    }
  })
})
