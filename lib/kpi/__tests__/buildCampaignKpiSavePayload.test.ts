import assert from "node:assert/strict"
import test from "node:test"
import { buildCampaignKpiSavePayload } from "../buildCampaignKpiSavePayload.js"
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

test("buildCampaignKpiSavePayload fans out with the given version identity", () => {
  const payload = buildCampaignKpiSavePayload({
    kpiRows: [kpiRow()],
    identity: {
      mp_client_name: "Client",
      mba_number: "MBA99",
      version_number: 3,
      campaign_name: "Camp",
    },
    mediaPairs: {
      ooh: {
        media: [
          {
            line_item: 12,
            line_item_id: "MBA99OH12",
            network: "vendor",
            bid_strategy: "cpm",
          },
        ],
      },
    },
  })
  assert.equal(payload.length, 1)
  assert.equal(payload[0]?.version_number, 3)
  assert.equal(payload[0]?.line_item_id, "MBA99OH12")
  assert.equal(payload[0]?.mba_number, "MBA99")
  assert.equal(payload[0]?.cpv, null)
})

test("buildCampaignKpiSavePayload writes campaign_kpi.cpv as null even when the row still has a value", () => {
  const payload = buildCampaignKpiSavePayload({
    kpiRows: [kpiRow({ cpv: 0.12 })],
    identity: {
      mp_client_name: "Client",
      mba_number: "MBA99",
      version_number: 1,
      campaign_name: "Camp",
    },
    mediaPairs: {
      ooh: {
        media: [
          {
            line_item: 12,
            line_item_id: "MBA99OH12",
            network: "vendor",
            bid_strategy: "cpm",
          },
        ],
      },
    },
  })
  assert.equal(payload.length, 1)
  assert.equal(payload[0]?.cpv, null)
})

test("buildCampaignKpiSavePayload returns fewer rows when a line item is missing", () => {
  const payload = buildCampaignKpiSavePayload({
    kpiRows: [kpiRow(), kpiRow({ lineItemId: "MBA99OH99" })],
    identity: {
      mp_client_name: "Client",
      mba_number: "MBA99",
      version_number: 1,
      campaign_name: "Camp",
    },
    mediaPairs: {
      ooh: {
        media: [
          {
            line_item: 12,
            line_item_id: "MBA99OH12",
            network: "vendor",
            bid_strategy: "cpm",
          },
        ],
      },
    },
  })
  assert.equal(payload.length, 1)
})
