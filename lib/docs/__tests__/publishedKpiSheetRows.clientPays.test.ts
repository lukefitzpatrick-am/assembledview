/**
 * S15 (review R4): a published Campaign KPIs row for a client-pays line is
 * flagged, so the sheet marks it. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"

const skip = mockModuleSkip()

if (supportsMockModule()) {
  await mock.module!("@/lib/data/readKpi", {
    namedExports: {
      readCampaignKpis: async () => [],
      readClientKpis: async () => [],
      readAllPublisherKpis: async () => [],
    },
  })
  await mock.module!("@/lib/delivery/deliveryFlags.server", {
    namedExports: { readDeliveryFlags: async () => ({ packageNoUnitTarget: false }) },
  })
}

function social(id: string, clientPays: boolean): LineItem {
  return {
    market: "National",
    platform: "meta",
    bidStrategy: "reach",
    targeting: id,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    deliverables: 100000,
    buyType: "cpm",
    deliverablesAmount: "1000",
    grossMedia: "1000",
    line_item_id: id,
    clientPaysForMedia: clientPays,
  }
}

test("only the client-pays line's KPI row is flagged", { skip }, async () => {
  const { publishedKpiSheetRows } = await import("../publishedKpiSheetRows.js")
  const keys = ["search", "socialMedia", "digiAudio", "digiDisplay", "digiVideo", "bvod", "progDisplay", "progVideo", "progBvod", "progOoh", "progAudio", "newspaper", "magazines", "television", "radio", "ooh", "cinema", "integration", "influencers", "production"]
  const mediaItems = Object.fromEntries(keys.map((k) => [k, []])) as unknown as MediaItems
  mediaItems.socialMedia = [social("ACME001SM1", false), social("ACME001SM2", true)]
  const rows = await publishedKpiSheetRows({
    mediaItems,
    publishers: [],
    clientName: "Acme",
    mbaNumber: "ACME001",
    versionNumber: 1,
    campaignName: "C",
    packageNoUnitTarget: false,
  })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.clientPays === true).sort(), [false, true])
})
