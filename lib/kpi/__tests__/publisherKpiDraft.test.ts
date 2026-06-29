import assert from "node:assert/strict"
import test from "node:test"
import type { ResolvedKPIRow } from "../types.js"
import type { Publisher } from "../../types/publisher.js"
import { buildPublisherKpiCreateBody } from "../../../components/kpis/KPIEditModal.js"

function row(overrides: Partial<ResolvedKPIRow> = {}): ResolvedKPIRow {
  return {
    mp_client_name: "Client",
    mba_number: "MBA-1",
    version_number: 1,
    campaign_name: "Campaign",
    media_type: "digiDisplay",
    publisher: "seven network",
    bid_strategy: "cpm",
    lineItemId: "L1",
    lineItemLabel: "Leaderboard",
    spend: 1000,
    deliverables: 100000,
    buyType: "CPM",
    source: "client",
    isManuallyEdited: false,
    hasPublisherKpi: false,
    ctr: 0.01,
    cpv: 0.02,
    conversion_rate: 0.03,
    vtr: 0.04,
    frequency: 2,
    calculatedClicks: 1000,
    calculatedViews: null,
    calculatedReach: null,
    ...overrides,
  }
}

test("buildPublisherKpiCreateBody resolves the row publisher to Xano publisherid and stores percent metrics as decimals", () => {
  const publishers = [
    {
      publisher_name: " Seven Network ",
      publisherid: "pub_123",
    } as Publisher,
  ]

  const draft = buildPublisherKpiCreateBody(row(), publishers, {
    ctr: "1.2%",
    cpv: "$0.4567",
    conversion_rate: "3.4",
    vtr: "50",
    frequency: "2.5",
  })

  assert.equal(draft.resolvedByPublisherId, true)
  assert.deepEqual(draft.body, {
    publisher: "pub_123",
    media_type: "digiDisplay",
    bid_strategy: "cpm",
    ctr: 0.012,
    cpv: 0.4567,
    conversion_rate: 0.034,
    vtr: 0.5,
    frequency: 2.5,
  })
})

test("buildPublisherKpiCreateBody falls back to the normalized row publisher name when no publisher id match exists", () => {
  const draft = buildPublisherKpiCreateBody(row({ publisher: "unknown publisher" }), [], {
    ctr: "",
    cpv: "",
    conversion_rate: "",
    vtr: "",
    frequency: "",
  })

  assert.equal(draft.resolvedByPublisherId, false)
  assert.equal(draft.body.publisher, "unknown publisher")
  assert.equal(draft.body.ctr, 0)
  assert.equal(draft.body.conversion_rate, 0)
  assert.equal(draft.body.vtr, 0)
})
