import assert from "node:assert/strict"
import test from "node:test"
import { fanOutKpiPayload, lookupLineItemsForKpiFanOut } from "../fanOut.js"
import type { ResolvedKPIRow } from "../types.js"

function kpiRow(over: Partial<ResolvedKPIRow> = {}): ResolvedKPIRow {
  return {
    mp_client_name: "Client",
    mba_number: "MBA99",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "ooh",
    publisher: "vendor",
    bid_strategy: "cpm",
    ctr: 0,
    cpv: 0,
    conversion_rate: 0,
    vtr: 0,
    frequency: 0,
    lineItemId: "MBA99OH12",
    lineItemLabel: "Line",
    spend: 100,
    deliverables: 1000,
    buyType: "cpm",
    source: "default",
    isManuallyEdited: false,
    calculatedClicks: 0,
    calculatedViews: 0,
    calculatedReach: 0,
    ...over,
  }
}

test("lookupLineItemsForKpiFanOut resolves digitalDisplay alias to digiDisplay map key", () => {
  const items = [{ line_item_id: "MBA99DD3", platform: "site-a" }]
  const map = { digiDisplay: items }
  const found = lookupLineItemsForKpiFanOut(map, "digitalDisplay")
  assert.equal(found.length, 1)
  assert.equal(found[0].line_item_id, "MBA99DD3")
})

test("fanOutKpiPayload matches by line number when stored id differs from KPI row id", () => {
  const rows = [kpiRow({ lineItemId: "MBA99OH12", media_type: "ooh" })]
  const payload = fanOutKpiPayload(
    rows,
    {
      mp_client_name: "Client",
      mba_number: "MBA99",
      version_number: 2,
      campaign_name: "Camp",
    },
    {
      ooh: [
        {
          line_item: 12,
          line_item_id: "MBA99OH12",
          network: "vendor",
          bid_strategy: "cpm",
        },
      ],
    },
  )
  assert.equal(payload.length, 1)
  assert.equal(payload[0].line_item_id, "MBA99OH12")
  assert.equal(payload[0].version_number, 2)
})

test("fanOutKpiPayload fills empty bid_strategy for API validation", () => {
  const rows = [
    kpiRow({
      lineItemId: "MBA99SE1",
      media_type: "search",
      publisher: "",
      bid_strategy: "",
    }),
  ]
  const payload = fanOutKpiPayload(
    rows,
    {
      mp_client_name: "Client",
      mba_number: "MBA99",
      version_number: 1,
      campaign_name: "Camp",
    },
    {
      search: [
        {
          line_item_id: "MBA99SE1",
          platform: "google",
          bid_strategy: "manual_cpc",
        },
      ],
    },
  )
  assert.equal(payload.length, 1)
  assert.equal(payload[0].bid_strategy, "manual_cpc")
  assert.equal(payload[0].publisher, "google")
})
